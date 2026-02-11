# 🚀 Deployment Instructions - veiled_markets_privacy.aleo

## Status

✅ **Contract Built Successfully**
- Program Name: `veiled_markets_privacy.aleo`
- Checksum: `[189u8, 216u8, 118u8, 37u8, 181u8, 169u8, 24u8, 232u8, 80u8, 51u8, 166u8, 30u8, 118u8, 233u8, 91u8, 128u8, 32u8, 203u8, 77u8, 210u8, 253u8, 69u8, 90u8, 209u8, 145u8, 76u8, 218u8, 107u8, 221u8, 127u8, 250u8, 96u8]`
- Location: `contracts/build/main.aleo`

## Deployment Methods

### Method 1: Using Leo CLI (Recommended)

```bash
cd contracts
leo deploy --network testnet --broadcast
```

**Note:** Leo CLI will prompt for confirmation. Type `y` and press Enter when prompted.

### Method 2: Using Deployment Script

```bash
cd contracts
./deploy-privacy.sh
```

### Method 3: Manual Deployment with snarkOS

If you have snarkOS installed:

```bash
cd contracts
snarkos developer deploy veiled_markets_privacy.aleo \
  --private-key $PRIVATE_KEY \
  --query https://api.explorer.provable.com/v1/testnet \
  --broadcast https://api.explorer.provable.com/v1/testnet/transaction/broadcast \
  --path ./build \
  --priority-fee 1000000
```

## Prerequisites

1. ✅ **Contract Built** - Already done ✅
2. ⏳ **Testnet Credits** - Need sufficient credits for deployment (~5-10 credits)
3. ⏳ **Private Key** - Configured in `contracts/.env`

## Check Balance

Before deploying, check your testnet balance:

```bash
leo account balance \
  --network testnet \
  --private-key $PRIVATE_KEY
```

Or get credits from faucet:
- https://faucet.aleo.org
- Enter your address: `aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8`

## After Deployment

1. **Wait for Confirmation** (1-2 minutes)

2. **Verify on Explorer:**
   ```
   https://testnet.explorer.provable.com/program/veiled_markets_privacy.aleo
   ```

3. **Update Frontend Configuration:**
   ```typescript
   // frontend/src/lib/config.ts
   export const PROGRAM_ID = 'veiled_markets_privacy.aleo'
   export const NETWORK = 'testnet'
   ```

## Program Details

- **Name:** `veiled_markets_privacy.aleo`
- **Version:** 0.2.0
- **Features:**
  - ✅ Privacy-enhanced betting
  - ✅ Delayed pool updates
  - ✅ Pool noise addition
  - ✅ Batch processing support

## Troubleshooting

### Error: Insufficient balance
- Get more credits from faucet
- Check balance with `leo account balance`

### Error: Program already exists
- This shouldn't happen with new name `veiled_markets_privacy.aleo`
- If it does, try a different name

### Error: Network timeout
- Check network status
- Try again in a few minutes

## Next Steps

After successful deployment:

1. ✅ Verify deployment on explorer
2. ⏳ Update frontend config
3. ⏳ Test contract functions
4. ⏳ Run indexer to discover markets
