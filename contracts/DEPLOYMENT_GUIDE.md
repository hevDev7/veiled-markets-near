# 🚀 Veiled Markets - Deployment Guide

## Prerequisites

✅ Leo CLI installed (v3.4.0+)
✅ Private key configured in `.env`
✅ Testnet credits (get from faucet)

## Build Status

✅ **Contract compiled successfully!**
- Program: `veiled_markets.aleo`
- Size: 8.62 KB / 97.66 KB
- Location: `build/main.aleo`

## Deployment Options

### Option 1: Deploy via Leo CLI (Recommended)

```bash
# Make sure you're in the contracts directory
cd contracts

# Deploy to testnet
leo deploy --network testnet

# Or with custom endpoint
leo deploy \
  --network testnet \
  --endpoint https://api.explorer.provable.com/v1/testnet
```

### Option 2: Deploy via snarkOS

```bash
# Install snarkOS if not already installed
cargo install snarkos

# Deploy
snarkos developer deploy veiled_markets.aleo \
  --private-key $ALEO_PRIVATE_KEY \
  --query https://api.explorer.provable.com/v1/testnet \
  --path ./build \
  --broadcast https://api.explorer.provable.com/v1/testnet/transaction/broadcast \
  --priority-fee 1000000
```

### Option 3: Use Deployment Script

```bash
# From project root
chmod +x scripts/deploy.sh
./scripts/deploy.sh

# Or dry-run to test
./scripts/deploy.sh --dry-run
```

## Get Testnet Credits

Before deploying, you need testnet credits:

1. **Via Faucet**: https://faucet.aleo.org
   - Enter your address: `aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8`
   - Request credits (usually 10-50 credits)

2. **Via Discord**: Join Aleo Discord and use the faucet bot

3. **Check Balance**:
   ```bash
   snarkos account balance \
     --address aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8 \
     --endpoint https://api.explorer.provable.com/v1/testnet
   ```

## Deployment Cost

Estimated deployment cost:
- **Program size**: 8.62 KB
- **Estimated fee**: ~5-10 credits (depends on network congestion)
- **Priority fee**: 0.001 credits (configurable)

## After Deployment

1. **Wait for confirmation** (1-2 minutes)

2. **Verify on Explorer**:
   - Testnet: https://testnet.explorer.provable.com/program/veiled_markets.aleo

3. **Update Frontend Configuration**:
   ```typescript
   // frontend/src/lib/config.ts
   export const PROGRAM_ID = 'veiled_markets.aleo'
   export const NETWORK = 'testnet'
   ```

4. **Test the Contract**:
   ```bash
   # Create a test market
   leo run create_market \
     "0field" \
     "3u8" \
     "1000000u64" \
     "2000000u64"
   ```

## Troubleshooting

### Error: Insufficient balance
- Get more credits from faucet
- Check balance with `snarkos account balance`

### Error: Program already exists
- Program name is already taken
- Change program name in `program.json`

### Error: Network timeout
- Try different endpoint
- Check network status: https://status.aleo.org

### Error: Invalid private key
- Verify private key in `.env` file
- Make sure it starts with `APrivateKey1`

## Program Functions

After deployment, these functions will be available:

### Market Creation
- `create_market` - Create new prediction market

### Betting
- `place_bet` - Place private bet on market
- `close_market` - Close betting after deadline

### Resolution
- `resolve_market` - Resolve market outcome
- `claim_winnings` - Claim winnings privately
- `withdraw_winnings` - Withdraw credits

### Management
- `cancel_market` - Cancel market (creator only)
- `emergency_cancel` - Cancel unresolved market
- `claim_refund` - Claim refund for cancelled market

## Next Steps

1. ✅ Build completed
2. ⏳ Get testnet credits
3. ⏳ Deploy contract
4. ⏳ Verify deployment
5. ⏳ Update frontend config
6. ⏳ Test contract functions

## Support

- Documentation: `./docs/`
- Issues: GitHub Issues
- Discord: Aleo Discord Server
