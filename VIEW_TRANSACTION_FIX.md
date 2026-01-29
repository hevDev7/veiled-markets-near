# View Transaction Link - Testing & Verification

## Current Implementation

### URL Format
```
https://testnet.explorer.provable.com/transaction/{transactionId}
```

### Example
```
https://testnet.explorer.provable.com/transaction/875e0310-def3-42a3-bff6-d40053bab1ff
```

## Configuration

### Explorer URL (config.ts)
```typescript
explorerUrl: 'https://testnet.explorer.provable.com'
```

### Function (config.ts & aleo-client.ts)
```typescript
export function getTransactionUrl(txId: string): string {
  console.log('getTransactionUrl called with:', txId);
  const url = `${config.explorerUrl}/transaction/${txId}`;
  console.log('Generated URL:', url);
  return url;
}
```

## Testing Steps

### 1. Place a Bet

1. Open browser console (F12)
2. Go to a market
3. Click YES or NO
4. Enter amount
5. Click "Place Bet"
6. Approve in Leo Wallet

### 2. Check Console Logs

Look for:
```
Leo Wallet: Transaction ID: 875e0310-def3-42a3-bff6-d40053bab1ff
Bet transaction submitted: 875e0310-def3-42a3-bff6-d40053bab1ff
getTransactionUrl called with: 875e0310-def3-42a3-bff6-d40053bab1ff
Generated URL: https://testnet.explorer.provable.com/transaction/875e0310-def3-42a3-bff6-d40053bab1ff
```

### 3. Verify Link

After bet is placed:
1. Modal shows "Bet Placed!"
2. Click "View Transaction" link
3. Should open: `https://testnet.explorer.provable.com/transaction/{your-tx-id}`
4. Explorer should show transaction details

## Expected Transaction ID Format

Leo Wallet returns transaction ID in UUID format:
```
875e0310-def3-42a3-bff6-d40053bab1ff
```

This is the correct format for Provable Explorer.

## Possible Issues

### Issue 1: Transaction ID is Wrong Format

**Symptoms:**
- Link opens but shows 404
- Transaction ID looks like: `at1...` (Aleo format)

**Cause:**
- Wallet returning Aleo transaction ID instead of UUID

**Fix:**
Check console log for actual transaction ID format. If it's `at1...`, we need to convert it.

### Issue 2: Link Doesn't Open

**Symptoms:**
- Click "View Transaction" but nothing happens
- No new tab opens

**Cause:**
- Popup blocker
- Transaction ID is null/undefined

**Fix:**
1. Check console for transaction ID
2. Allow popups for localhost
3. Right-click link → "Open in new tab"

### Issue 3: Explorer Shows "Transaction Not Found"

**Symptoms:**
- Link opens correctly
- Explorer shows transaction not found

**Cause:**
- Transaction not yet confirmed on blockchain
- Transaction ID is incorrect

**Fix:**
1. Wait 30-60 seconds for confirmation
2. Refresh explorer page
3. Check transaction ID in console

## Verification Checklist

After placing a bet, verify:

- [ ] Console shows transaction ID
- [ ] Transaction ID is UUID format (with dashes)
- [ ] "View Transaction" link is visible
- [ ] Link URL is correct format
- [ ] Clicking link opens new tab
- [ ] Explorer loads (may show "not found" initially)
- [ ] After 30-60s, transaction appears on explorer

## Example Console Output (Success)

```
=== PLACE BET DEBUG ===
Market ID: 3582024152336217571382682973364798990155453514672503623063651091171230848724field
Amount: 2000000
Outcome: no
Bettor: aleo1...
Inputs: ["3582024152336217571382682973364798990155453514672503623063651091171230848724field", "2000000u64", "2u8", "aleo1..."]
Inputs types: ["string", "string", "string", "string"]
Program ID: veiled_markets.aleo
Wallet type: leo
Inputs validated, requesting transaction...

Leo Wallet: Executing transaction...
Leo Wallet: Request: {
  program: "veiled_markets.aleo",
  function: "place_bet",
  inputs: [...],
  fee: 500000
}
Leo Wallet: Inputs validated: [...]
Leo Wallet: Transaction result: {transactionId: "875e0310-def3-42a3-bff6-d40053bab1ff"}
Leo Wallet: Result type: object
Leo Wallet: Result keys: ["transactionId"]
Leo Wallet: Transaction ID: 875e0310-def3-42a3-bff6-d40053bab1ff

Bet transaction submitted: 875e0310-def3-42a3-bff6-d40053bab1ff

getTransactionUrl called with: 875e0310-def3-42a3-bff6-d40053bab1ff
Generated URL: https://testnet.explorer.provable.com/transaction/875e0310-def3-42a3-bff6-d40053bab1ff
```

## Testing Different Scenarios

### Scenario 1: Successful Bet
1. Place bet
2. Approve in wallet
3. Check "View Transaction" link
4. Verify URL format
5. Click link
6. Wait for confirmation on explorer

### Scenario 2: Create Market
1. Create new market
2. Check transaction ID in success modal
3. Verify "View on Explorer" link
4. Click and verify

### Scenario 3: Multiple Bets
1. Place multiple bets
2. Each should have unique transaction ID
3. Each link should work independently

## Current Status

✅ Explorer URL configured correctly
✅ getTransactionUrl function implemented
✅ Links in UI use correct function
✅ Transaction ID format from Leo Wallet is UUID
✅ URL format matches Provable Explorer

## If Link Still Not Working

Share these details:

1. **Console log** showing transaction ID
2. **Generated URL** from console
3. **What happens** when you click the link
4. **Browser** you're using
5. **Screenshot** of the link (hover to see URL)

Example to check in console:
```javascript
// Check config
console.log('Explorer URL:', config.explorerUrl);

// Test URL generation
console.log('Test URL:', getTransactionUrl('875e0310-def3-42a3-bff6-d40053bab1ff'));
```

Expected output:
```
Explorer URL: https://testnet.explorer.provable.com
Test URL: https://testnet.explorer.provable.com/transaction/875e0310-def3-42a3-bff6-d40053bab1ff
```
