# Quick Deploy Guide - Veiled Markets

## TL;DR - Deploy Now!

```bash
cd contracts
leo deploy --network testnet --broadcast
```

**That's it!** The `--broadcast` flag sends your transaction to the network.

---

## Common Issues

### ❌ Transaction NOT broadcast
**Problem**: You see "Transaction(s) will NOT be broadcast to the network"

**Solution**: Add `--broadcast` flag:
```bash
leo deploy --network testnet --broadcast
```

### ❌ Insufficient balance
**Problem**: "Insufficient balance" error

**Solution**: Get testnet credits from faucet:
- Visit: https://faucet.aleo.org/
- Enter address: `aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8`
- Request 15 credits (deployment needs ~13.18)

### ❌ Endpoint errors
**Problem**: "Failed to retrieve from endpoint" or 404 errors

**Solution**: Use Provable API v2 (more stable):
```bash
leo deploy --network testnet --endpoint https://api.provable.com/v2/testnet --broadcast
```

---

## Verify Deployment

After successful deployment, verify with:

```bash
# Check if program exists
curl "https://api.provable.com/v2/testnet/program/veiled_markets.aleo"

# Or visit explorer
# https://testnet.aleoscan.io/program/veiled_markets.aleo
```

---

## Deployment Cost

- Transaction Storage: 11.630000 credits
- Program Synthesis: 0.548882 credits
- Namespace: 1.000000 credits
- **Total: 13.178882 credits**

Make sure you have at least 14 credits before deploying!

---

## Environment Variables

Your `.env` file should have:

```env
ALEO_PRIVATE_KEY=APrivateKey1zkp2hcw63PzWVN385KsjeRkKFs76TeogaMrXfsAViFRVAgE
ALEO_ADDRESS=aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8
ALEO_NETWORK=testnet
ALEO_ENDPOINT=https://api.provable.com/v2/testnet
```

Leo automatically loads these from `.env` file.

---

## Next Steps After Deployment

1. ✅ Verify deployment on explorer
2. ✅ Update frontend `.env` with program ID
3. ✅ Test contract functions via frontend
4. ✅ Share your deployed program!

---

## Need Help?

- Leo Documentation: https://developer.aleo.org/leo/
- Aleo Discord: https://discord.gg/aleo
- Explorer: https://testnet.aleoscan.io/
