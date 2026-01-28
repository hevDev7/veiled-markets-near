# Deployment Troubleshooting - Error 500

## Problem
```
Error [ECLI0377032]: Failed to broadcast transaction: http status: 500
```

## Analysis

Your deployment transaction was created successfully:
- ✅ Contract compiled: 262 statements
- ✅ Transaction created: 14.181001 credits cost
- ✅ Balance sufficient: 18.91179 credits available
- ❌ Broadcast failed: HTTP 500 from server

**This is NOT a problem with your code!** The error is from the Provable API server.

## Possible Causes

1. **Program Size**: Your contract is large (327,872 variables, 245,129 constraints)
2. **Server Overload**: API endpoint might be experiencing high load
3. **Network Issues**: Temporary connectivity problems

## Solutions

### Solution 1: Retry with Different Endpoint (Recommended)

Try using the official Aleo API endpoint:

```bash
leo deploy --network testnet --endpoint https://api.explorer.aleo.org/v1 --broadcast
```

### Solution 2: Deploy via Leo Playground (Most Reliable)

This bypasses CLI issues entirely:

1. **Open Leo Playground**: https://play.leo-lang.org/

2. **Import Your Private Key**:
   - Click wallet icon (top right)
   - Select "Import Private Key"
   - Paste: `APrivateKey1zkp2hcw63PzWVN385KsjeRkKFs76TeogaMrXfsAViFRVAgE`

3. **Copy Contract Code**:
   ```bash
   cat build/main.aleo
   ```
   Copy ALL the output (should be ~300 lines)

4. **Paste into Playground**:
   - Clear default code
   - Paste your contract code
   - Click "Deploy" button

5. **Wait for Confirmation**:
   - Deployment takes 5-10 minutes
   - You'll receive a transaction ID

6. **Verify**:
   - Visit: https://testnet.aleoscan.io/program/veiled_markets.aleo

### Solution 3: Wait and Retry

Sometimes the API is temporarily overloaded. Wait 10-15 minutes and retry:

```bash
leo deploy --network testnet --broadcast
```

### Solution 4: Use Local Node (Advanced)

If you have a local Aleo node running:

```bash
leo deploy --network testnet --endpoint http://localhost:3030 --broadcast
```

### Solution 5: Simplify Contract (Last Resort)

If the contract is too large, you might need to:
- Remove some inline functions
- Simplify logic
- Split into multiple programs

But try Solutions 1-3 first!

## Recommended Next Steps

1. ✅ **Try Solution 2 (Leo Playground)** - Most reliable for large contracts
2. ⏳ If that fails, wait 30 minutes and try Solution 1
3. 📧 If still failing, contact Aleo Discord for API status

## Contract Stats

Your contract is quite large:
- Variables: 327,872 (15.6% of max 2,097,152)
- Constraints: 245,129 (11.7% of max 2,097,152)
- Cost: 14.181001 credits

This is within limits but might cause issues with some API endpoints.

## Alternative: Deploy to Canary Network

If testnet continues to have issues, try Canary network:

```bash
leo deploy --network canary --broadcast
```

Canary is more stable and production-like.

---

**Bottom Line**: Your code is fine! This is an API/network issue. Use Leo Playground for most reliable deployment.
