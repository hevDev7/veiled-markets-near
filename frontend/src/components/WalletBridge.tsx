// ============================================================================
// WALLET BRIDGE
// ============================================================================
// Syncs AleoWalletProvider state → useWalletStore (Zustand).
// This allows all existing components to keep using useWalletStore
// while the actual wallet connection is managed by AleoWalletProvider.
// ============================================================================

import { useEffect, useRef } from 'react'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useWalletStore, useBetsStore } from '@/lib/store'

export function WalletBridge() {
  const { connected, connecting, address, wallet, requestRecords, requestRecordPlaintexts, decrypt } = useWallet() as any
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

  useEffect(() => {
    const store = useWalletStore.getState()

    if (connected && address) {
      // Map provider wallet name to our WalletType
      const walletName = wallet?.adapter?.name || ''
      console.warn('[WalletBridge] adapter name:', JSON.stringify(walletName), '| wallet:', wallet ? 'present' : 'null', '| adapter:', wallet?.adapter ? 'present' : 'null')
      let walletType: 'leo' | 'fox' | 'soter' | 'puzzle' | 'shield' | 'demo' = 'leo'
      if (walletName.toLowerCase().includes('fox')) walletType = 'fox'
      else if (walletName.toLowerCase().includes('soter')) walletType = 'soter'
      else if (walletName.toLowerCase().includes('puzzle')) walletType = 'puzzle'
      else if (walletName.toLowerCase().includes('shield')) walletType = 'shield'
      // Also detect Shield via window.shield if adapter name detection fails
      else if (!walletName && (window as any).shield) walletType = 'shield'
      console.warn('[WalletBridge] detected walletType:', walletType)

      useWalletStore.setState({
        wallet: {
          connected: true,
          connecting: false,
          address,
          network: 'testnet',
          balance: store.wallet.balance, // Keep existing balance until refresh
          walletType,
          isDemoMode: false,
        },
        error: null,
      })

      // Auto-refresh balance and load bets on new connection
      if (!prevConnected.current) {
        setTimeout(() => {
          useWalletStore.getState().refreshBalance()
          useBetsStore.getState().loadBetsForAddress(address)
        }, 300)
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
      // Disconnected
      useWalletStore.setState({
        wallet: {
          connected: false,
          connecting: false,
          address: null,
          network: 'testnet',
          balance: { public: 0n, private: 0n, usdcxPublic: 0n },
          walletType: null,
          isDemoMode: false,
        },
        error: null,
      })
      prevConnected.current = false
    }
  }, [connected, connecting, address, wallet])

  return null // Bridge component renders nothing
}
