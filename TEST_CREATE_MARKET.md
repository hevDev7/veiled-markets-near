# Test Create Market - Troubleshooting Guide

## Current Issue
Leo Wallet SDK returns generic error: `AleoWalletError: An unknown error occured`

## Possible Causes
1. **Leo Wallet version incompatibility** - Extension version doesn't match SDK expectations
2. **Custom program not supported** - Leo Wallet may not support executing custom programs on testnet
3. **Network mismatch** - Wallet on "testnet" but program deployed on "testnetbeta"
4. **Missing permissions** - Wallet needs additional permissions for custom programs

## Solutions to Try

### Solution 1: Install Puzzle Wallet (RECOMMENDED)
Puzzle Wallet has better testnet support and more stable SDK.

**Steps:**
1. Download Puzzle Wallet: https://puzzle.online/
2. Install browser extension
3. Create/Import account
4. Switch to **Testnet Beta** network
5. Get testnet credits from faucet
6. Reconnect in dashboard
7. Try create market again

### Solution 2: Test with Aleo CLI
Verify contract works by testing directly with CLI.

**Steps:**
```bash
cd contracts

# Create market using CLI
snarkos developer execute veiled_markets.aleo create_market \
  "1234567890123456789012345678901234567890123456789012345678field" \
  "3u8" \
  "1000000u64" \
  "1100000u64" \
  --private-key "APrivateKey1zkp..." \
  --query "https://api.explorer.provable.com/v1" \
  --broadcast "https://api.explorer.provable.com/v1/testnet/transaction/broadcast" \
  --fee 1000000
```

### Solution 3: Use Aleo Playground
Test contract in browser without wallet.

**Steps:**
1. Go to: https://play.leo-lang.org/
2. Copy `contracts/src/main.leo` content
3. Paste in playground
4. Import `credits.aleo`
5. Run `create_market` function with test inputs
6. Verify it compiles and executes

### Solution 4: Enable Demo Mode (UI Testing Only)
Test UI flow without real transactions.

**Already enabled in `.env`:**
```
VITE_ENABLE_DEMO_MODE=true
VITE_DEFAULT_WALLET=demo
```

Refresh page and wallet will auto-connect in demo mode.

## Recommended Next Steps

1. **Install Puzzle Wallet** - Most reliable for testnet
2. **Test with CLI** - Verify contract works
3. **Report to Leo Wallet** - If issue persists, report to Leo Wallet team

## Alternative: Manual Transaction Testing

If you want to test the contract manually:

1. Get your private key from Leo Wallet
2. Use Aleo CLI to execute transaction
3. Get transaction ID
4. Manually add market to dashboard using transaction ID

Would you like me to:
- [ ] Help install and setup Puzzle Wallet
- [ ] Create CLI test script
- [ ] Enable demo mode for UI testing
- [ ] Create manual transaction testing guide
