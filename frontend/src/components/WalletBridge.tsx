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
  const signingLock = useRef(false) // Prevent concurrent signMessage calls

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
  const initForAddress = useCallback(async (addr: string) => {
    // Immediate: refresh balance and load bets (no lock needed for these)
    useWalletStore.getState().refreshBalance()
    useBetsStore.getState().loadBetsForAddress(addr)

    // Derive encryption key — locked to prevent duplicate sign popups
    if (signingLock.current) {
      devLog('[WalletBridge] Skipping signMessage — already in progress')
      return
    }
    signingLock.current = true

    try {
      await new Promise(r => setTimeout(r, 200))
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
    } finally {
      signingLock.current = false
    }
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
            ? { public: 0n, private: 0n, usdcxPublic: 0n, usdcxPrivate: 0n, usadPublic: 0n, usadPrivate: 0n }
            : store.wallet.balance,
          walletType,
          isDemoMode: false,
          encryptionKey: null, // Reset on each (re)connect or account switch
        },
        error: null,
        balanceStatus: isAccountSwitch ? 'idle' : useWalletStore.getState().balanceStatus,
        balanceError: null,
        lastBalanceRefreshAt: isAccountSwitch ? null : useWalletStore.getState().lastBalanceRefreshAt,
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
          balance: { public: 0n, private: 0n, usdcxPublic: 0n, usdcxPrivate: 0n, usadPublic: 0n, usadPrivate: 0n },
          walletType: null,
          isDemoMode: false,
          encryptionKey: null,
        },
        error: null,
        balanceStatus: 'idle',
        balanceError: null,
        lastBalanceRefreshAt: null,
      })
      prevConnected.current = false
      prevAddress.current = null
      signingLock.current = false
    }
  }, [connected, connecting, address, wallet, signMessage, initForAddress])

  // Auto-refresh balance periodically while connected
  useEffect(() => {
    if (!connected || !address) return
    const interval = setInterval(() => {
      useWalletStore.getState().refreshBalance()
    }, 30_000) // Every 30 seconds
    return () => clearInterval(interval)
  }, [connected, address])

  // Shield wallet doesn't always emit adapter events when user switches accounts in the extension.
  // Poll window.shield.getAccount() every 1s while connected to catch external account changes.
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
          sessionStorage.removeItem(SIG_CACHE_KEY)
          prevAddress.current = currentAddress
          useWalletStore.setState({
            wallet: {
              ...useWalletStore.getState().wallet,
              address: currentAddress,
              balance: { public: 0n, private: 0n, usdcxPublic: 0n, usdcxPrivate: 0n, usadPublic: 0n, usadPrivate: 0n },
              encryptionKey: null,
            },
            balanceStatus: 'idle',
            balanceError: null,
            lastBalanceRefreshAt: null,
          })
          initForAddress(currentAddress)
        }
      } catch {
        // Shield API unavailable — ignore
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [connected, initForAddress])

  // Listen for Shield wallet events (connect/disconnect/accountChanged)
  useEffect(() => {
    const shieldApi = (window as any).shield
    if (!shieldApi) return

    const handleAccountChanged = (account: any) => {
      const newAddr = account?.address || account
      if (typeof newAddr === 'string' && newAddr.startsWith('aleo') && newAddr !== prevAddress.current) {
        devWarn('[WalletBridge] Shield accountChanged event:', newAddr.slice(0, 12))
        sessionStorage.removeItem(SIG_CACHE_KEY)
        prevAddress.current = newAddr
        useWalletStore.setState({
          wallet: {
            ...useWalletStore.getState().wallet,
            address: newAddr,
            balance: { public: 0n, private: 0n, usdcxPublic: 0n, usdcxPrivate: 0n, usadPublic: 0n, usadPrivate: 0n },
            encryptionKey: null,
          },
          balanceStatus: 'idle',
          balanceError: null,
          lastBalanceRefreshAt: null,
        })
        initForAddress(newAddr)
      }
    }

    // Shield wallet may emit events via addEventListener or on()
    if (shieldApi.on) {
      shieldApi.on('accountChanged', handleAccountChanged)
      shieldApi.on('accountsChanged', handleAccountChanged)
    }
    if (shieldApi.addEventListener) {
      shieldApi.addEventListener('accountChanged', handleAccountChanged)
    }

    return () => {
      if (shieldApi.off) {
        shieldApi.off('accountChanged', handleAccountChanged)
        shieldApi.off('accountsChanged', handleAccountChanged)
      }
      if (shieldApi.removeEventListener) {
        shieldApi.removeEventListener('accountChanged', handleAccountChanged)
      }
    }
  }, [initForAddress])

  return null // Bridge component renders nothing
}
