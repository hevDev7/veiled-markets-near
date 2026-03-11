// ============================================================================
// WALLET BRIDGE
// ============================================================================
// Syncs AleoWalletProvider state → useWalletStore (Zustand).
// This allows all existing components to keep using useWalletStore
// while the actual wallet connection is managed by AleoWalletProvider.
//
// Also derives an AES-256-GCM encryption key from the wallet's signature
// for privacy-preserving Supabase bet data sync. See crypto.ts.
// ============================================================================

import { useEffect, useRef, useCallback } from 'react'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useWalletStore, useBetsStore } from '@/lib/store'
import { devLog, devWarn } from '../lib/logger'
import { deriveEncryptionKey, ENCRYPTION_SIGN_MESSAGE, SIG_CACHE_KEY } from '@/lib/crypto'

export function WalletBridge() {
  const { connected, connecting, address, wallet, signMessage, requestRecords, requestRecordPlaintexts, decrypt } = useWallet() as any
  const prevConnected = useRef(false)
  const prevAddress = useRef<string | null>(null)

  // Store provider functions on window so refreshBalance can access them outside React
  useEffect(() => {
    if (connected) {
      (window as any).__aleoRequestRecords = requestRecords
      ;(window as any).__aleoRequestRecordPlaintexts = requestRecordPlaintexts
      ;(window as any).__aleoDecrypt = decrypt
    } else {
      delete (window as any).__aleoRequestRecords
      delete (window as any).__aleoRequestRecordPlaintexts
      delete (window as any).__aleoDecrypt
    }
  }, [connected, requestRecords, requestRecordPlaintexts, decrypt])

  // Diagnostic: log wallet connection state changes
  useEffect(() => {
    devWarn('[WalletBridge] state:', { connected, connecting, address: address?.slice(0, 12), hasWallet: !!wallet })
  }, [connected, connecting, address, wallet])

  // Shared helper: initialize data for the current address (balance + bets + enc key)
  const initForAddress = useCallback((addr: string) => {
    setTimeout(() => {
      useWalletStore.getState().refreshBalance()
      useBetsStore.getState().loadBetsForAddress(addr)
    }, 300)

    setTimeout(async () => {
      try {
        // Clear old key cache on account switch
        let signature = sessionStorage.getItem(SIG_CACHE_KEY)

        if (!signature && signMessage) {
          devLog('[WalletBridge] Requesting wallet signature for encryption key...')
          const result = await Promise.race([
            signMessage(ENCRYPTION_SIGN_MESSAGE),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
          ])
          if (result) {
            signature = typeof result === 'string' ? result : new TextDecoder().decode(result)
            if (signature) sessionStorage.setItem(SIG_CACHE_KEY, signature)
          } else {
            devWarn('[WalletBridge] signMessage timed out or returned null')
          }
        }

        if (signature) {
          const encKey = await deriveEncryptionKey(signature)
          if (encKey) {
            useWalletStore.setState({ wallet: { ...useWalletStore.getState().wallet, encryptionKey: encKey } })
            devLog('[WalletBridge] Encryption key derived successfully')
            useBetsStore.getState().flushToSupabase()
          } else {
            devWarn('[WalletBridge] Key derivation returned null (non-deterministic wallet)')
          }
        }
      } catch (err) {
        devWarn('[WalletBridge] Encryption key derivation failed:', err)
      }
    }, 500)
  }, [signMessage])

  useEffect(() => {
    const store = useWalletStore.getState()

    if (connected && address) {
      // Map provider wallet name to our WalletType
      const walletName = wallet?.adapter?.name || ''
      devWarn('[WalletBridge] adapter name:', JSON.stringify(walletName), '| wallet:', wallet ? 'present' : 'null', '| adapter:', wallet?.adapter ? 'present' : 'null')
      let walletType: 'leo' | 'fox' | 'soter' | 'puzzle' | 'shield' | 'demo' = 'leo'
      if (walletName.toLowerCase().includes('fox')) walletType = 'fox'
      else if (walletName.toLowerCase().includes('soter')) walletType = 'soter'
      else if (walletName.toLowerCase().includes('puzzle')) walletType = 'puzzle'
      else if (walletName.toLowerCase().includes('shield')) walletType = 'shield'
      // Also detect Shield via window.shield if adapter name detection fails
      else if (!walletName && (window as any).shield) walletType = 'shield'
      devWarn('[WalletBridge] detected walletType:', walletType)

      const isAccountSwitch = prevConnected.current && prevAddress.current !== null && prevAddress.current !== address

      useWalletStore.setState({
        wallet: {
          connected: true,
          connecting: false,
          address,
          network: 'testnet',
          balance: isAccountSwitch
            ? { public: 0n, private: 0n, usdcxPublic: 0n, usdcxPrivate: 0n }
            : store.wallet.balance,
          walletType,
          isDemoMode: false,
          encryptionKey: null, // Reset on each (re)connect or account switch
        },
        error: null,
      })

      // Init on first connection OR account switch
      if (!prevConnected.current || isAccountSwitch) {
        if (isAccountSwitch) {
          devWarn('[WalletBridge] Account switched:', prevAddress.current?.slice(0, 12), '→', address.slice(0, 12))
          sessionStorage.removeItem(SIG_CACHE_KEY) // Clear old enc key cache
        }
        initForAddress(address)
      }

      prevConnected.current = true
      prevAddress.current = address
    } else if (connecting) {
      useWalletStore.setState({
        wallet: {
          ...store.wallet,
          connecting: true,
        },
      })
    } else if (!connected && prevConnected.current) {
      // Disconnected — clear encryption key and cached signature
      sessionStorage.removeItem(SIG_CACHE_KEY)
      useWalletStore.setState({
        wallet: {
          connected: false,
          connecting: false,
          address: null,
          network: 'testnet',
          balance: { public: 0n, private: 0n, usdcxPublic: 0n, usdcxPrivate: 0n },
          walletType: null,
          isDemoMode: false,
          encryptionKey: null,
        },
        error: null,
      })
      prevConnected.current = false
      prevAddress.current = null
    }
  }, [connected, connecting, address, wallet, signMessage, initForAddress])

  // Shield wallet doesn't always emit adapter events when user switches accounts in the extension.
  // Poll window.shield.getAccount() every 2s while connected to catch external account changes.
  useEffect(() => {
    if (!connected) return

    const shieldApi = (window as any).shield
    if (!shieldApi?.getAccount) return // Only for Shield wallet

    const interval = setInterval(async () => {
      try {
        const account = await shieldApi.getAccount()
        const currentAddress = account?.address || account
        if (
          typeof currentAddress === 'string' &&
          currentAddress.startsWith('aleo') &&
          prevAddress.current &&
          currentAddress !== prevAddress.current
        ) {
          devWarn('[WalletBridge] Shield account change detected via poll:', currentAddress.slice(0, 12))
          // Force adapter to re-read the new account by updating store directly.
          // The adapter's address state will catch up on next render cycle.
          sessionStorage.removeItem(SIG_CACHE_KEY)
          prevAddress.current = currentAddress
          useWalletStore.setState({
            wallet: {
              ...useWalletStore.getState().wallet,
              address: currentAddress,
              balance: { public: 0n, private: 0n, usdcxPublic: 0n, usdcxPrivate: 0n },
              encryptionKey: null,
            },
          })
          initForAddress(currentAddress)
        }
      } catch {
        // Shield API unavailable — ignore
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [connected, initForAddress])

  return null // Bridge component renders nothing
}
