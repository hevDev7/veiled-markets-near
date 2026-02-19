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

import { useEffect, useRef } from 'react'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useWalletStore, useBetsStore } from '@/lib/store'
import { devLog, devWarn } from '../lib/logger'
import { deriveEncryptionKey, ENCRYPTION_SIGN_MESSAGE, SIG_CACHE_KEY } from '@/lib/crypto'

export function WalletBridge() {
  const { connected, connecting, address, wallet, signMessage, requestRecords, requestRecordPlaintexts, decrypt } = useWallet() as any
  const prevConnected = useRef(false)

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

      useWalletStore.setState({
        wallet: {
          connected: true,
          connecting: false,
          address,
          network: 'testnet',
          balance: store.wallet.balance, // Keep existing balance until refresh
          walletType,
          isDemoMode: false,
          encryptionKey: null, // Will be set after key derivation
        },
        error: null,
      })

      // Auto-refresh balance and load bets on new connection
      if (!prevConnected.current) {
        setTimeout(() => {
          useWalletStore.getState().refreshBalance()
          // Load bets immediately from localStorage (no encryption needed)
          useBetsStore.getState().loadBetsForAddress(address)
        }, 300)

        // Derive encryption key in background (non-blocking, with timeout)
        // This doesn't block dashboard loading — Supabase sync will use the key
        // once available, or fall back to unencrypted if key derivation fails.
        setTimeout(async () => {
          try {
            // Try sessionStorage cache first (avoids popup on page refresh)
            let signature = sessionStorage.getItem(SIG_CACHE_KEY)

            if (!signature && signMessage) {
              devLog('[WalletBridge] Requesting wallet signature for encryption key...')
              // Race signMessage against a 10s timeout to prevent hanging
              const result = await Promise.race([
                signMessage(ENCRYPTION_SIGN_MESSAGE),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
              ])
              if (result) {
                signature = typeof result === 'string' ? result : new TextDecoder().decode(result)
                if (signature) {
                  sessionStorage.setItem(SIG_CACHE_KEY, signature)
                }
              } else {
                devWarn('[WalletBridge] signMessage timed out or returned null')
              }
            }

            if (signature) {
              const encKey = await deriveEncryptionKey(signature)
              if (encKey) {
                useWalletStore.setState({
                  wallet: {
                    ...useWalletStore.getState().wallet,
                    encryptionKey: encKey,
                  },
                })
                devLog('[WalletBridge] Encryption key derived successfully')
                // Flush all local bet data to Supabase now that encryption is available.
                // This ensures any data saved before key derivation gets encrypted.
                useBetsStore.getState().flushToSupabase()
              } else {
                devWarn('[WalletBridge] Key derivation returned null (non-deterministic wallet)')
              }
            }
          } catch (err) {
            devWarn('[WalletBridge] Encryption key derivation failed:', err)
          }
        }, 500)
      }

      prevConnected.current = true
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
          balance: { public: 0n, private: 0n, usdcxPublic: 0n },
          walletType: null,
          isDemoMode: false,
          encryptionKey: null,
        },
        error: null,
      })
      prevConnected.current = false
    }
  }, [connected, connecting, address, wallet, signMessage])

  return null // Bridge component renders nothing
}
