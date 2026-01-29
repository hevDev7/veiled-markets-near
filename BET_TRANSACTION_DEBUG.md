# Debug: Bet Transaction Failed

## Error
```
Bet Failed: Transaction rejected or no event ID returned
```

## Possible Causes

### 1. Wallet Type Issue
**Puzzle Wallet**: Has SDK bug, tidak bisa digunakan untuk transaksi
**Leo Wallet**: Should work, tapi perlu setup yang benar

### 2. Network Mismatch
- Wallet harus di **Testnet Beta** atau **Testnet**
- Program deployed di testnet
- Jika network tidak match, transaksi akan gagal

### 3. Insufficient Balance
- Butuh credits untuk fee (0.5 credits)
- Butuh credits untuk bet amount
- Total needed: bet_amount + 0.5 credits

### 4. Program Not Found
- Program `veiled_markets.aleo` harus deployed
- Function `place_bet` harus ada
- Inputs harus sesuai signature

### 5. Invalid Inputs
- Market ID harus valid field
- Amount harus valid u64
- Outcome harus 1u8 (yes) atau 2u8 (no)
- Bettor address harus valid

## Debugging Steps

### Step 1: Check Console Logs

Buka browser console (F12) dan cari:

```
=== PLACE BET DEBUG ===
Market ID: [should be a field value ending with 'field']
Amount: [should be a number]
Outcome: yes or no
Bettor: [your wallet address]
Inputs: [array of 4 strings]
Inputs types: [should all be 'string']
Program ID: veiled_markets.aleo
Wallet type: leo or puzzle
```

**Check:**
- ✅ All inputs are strings
- ✅ Market ID ends with 'field'
- ✅ Amount is valid number
- ✅ Bettor address is valid
- ✅ Wallet type is 'leo' (NOT 'puzzle')

### Step 2: Check Wallet Connection

```
Leo Wallet: Executing transaction...
Leo Wallet: Request: {
  program: "veiled_markets.aleo",
  function: "place_bet",
  inputs: ["...", "...", "...", "..."],
  fee: 500000
}
Leo Wallet: Inputs validated: [...]
```

**Check:**
- ✅ Wallet is connected
- ✅ Request shows correct program and function
- ✅ Inputs are validated

### Step 3: Check Transaction Result

```
Leo Wallet: Transaction result: [object or string]
Leo Wallet: Result type: [should be 'object' or 'string']
Leo Wallet: Result keys: [if object, shows keys]
Leo Wallet: Transaction ID: [should show transaction ID]
```

**If you see:**
- ❌ "No transaction ID returned" → Wallet didn't return proper response
- ❌ "Transaction rejected by user" → You cancelled in wallet
- ❌ "Insufficient balance" → Need more credits
- ❌ "Program or function not found" → Deployment issue

## Solutions

### Solution 1: Use Leo Wallet (RECOMMENDED)

1. **Install Leo Wallet**
   ```
   https://leo.app
   ```

2. **Setup**
   - Create/Import account
   - Switch to **Testnet Beta**
   - Get testnet credits from faucet

3. **Connect**
   - Disconnect current wallet
   - Click "Connect Wallet"
   - Choose "Leo Wallet"
   - Approve connection

4. **Try Bet Again**
   - Select market
   - Enter amount
   - Click YES or NO
   - Approve in Leo Wallet popup

### Solution 2: Check Balance

```bash
# Check your balance in wallet
# Should have:
# - Bet amount (e.g., 1000000 = 1 credit)
# - Fee (500000 = 0.5 credits)
# Total: 1.5 credits minimum
```

If insufficient:
- Get testnet credits from faucet
- Use smaller bet amount

### Solution 3: Verify Program Deployment

Check if program is deployed:
```
https://explorer.provable.com/program/veiled_markets.aleo?network=testnet
```

Should show:
- ✅ Program exists
- ✅ Function `place_bet` exists
- ✅ Correct signature: `place_bet(market_id: field, amount: u64, outcome: u8, bettor: address)`

### Solution 4: Check Market ID

Market ID harus valid:
```javascript
// Valid format:
"1234567890abcdef1234567890abcdef1234567890abcdef1234567890abfield"

// Invalid:
"market_001" // Not a field
"" // Empty
undefined // Not defined
```

### Solution 5: Try Demo Mode (Testing Only)

For UI testing without real transactions:

1. Disconnect wallet
2. Connect with "Demo Mode"
3. Try placing bet
4. Should work without real blockchain

## Expected Console Output (Success)

```
=== PLACE BET DEBUG ===
Market ID: 1234567890abcdef...field
Amount: 1000000
Outcome: yes
Bettor: aleo1...
Inputs: ["1234567890abcdef...field", "1000000u64", "1u8", "aleo1..."]
Inputs types: ["string", "string", "string", "string"]
Program ID: veiled_markets.aleo
Wallet type: leo
Inputs validated, requesting transaction...

Leo Wallet: Executing transaction...
Leo Wallet: Request: {
  program: "veiled_markets.aleo",
  function: "place_bet",
  inputs: ["...", "...", "...", "..."],
  fee: 500000
}
Leo Wallet: Inputs validated: ["...", "...", "...", "..."]
Leo Wallet: Transaction result: {transactionId: "at1..."}
Leo Wallet: Result type: object
Leo Wallet: Result keys: ["transactionId"]
Leo Wallet: Transaction ID: at1...
Bet transaction submitted: at1...
```

## Common Issues

### Issue 1: "Transaction rejected or no event ID returned"

**Cause**: Wallet didn't return transaction ID

**Fix**:
1. Check wallet popup appeared
2. Make sure you approved (not rejected)
3. Check wallet is unlocked
4. Try again

### Issue 2: "Insufficient balance"

**Cause**: Not enough credits

**Fix**:
1. Check balance in wallet
2. Get testnet credits from faucet
3. Use smaller bet amount

### Issue 3: "Program or function not found"

**Cause**: Program not deployed or wrong network

**Fix**:
1. Verify program deployed on testnet
2. Check wallet on correct network
3. Verify program ID: `veiled_markets.aleo`

### Issue 4: Puzzle Wallet Error

**Cause**: Puzzle Wallet SDK bug

**Fix**:
1. Disconnect Puzzle Wallet
2. Install Leo Wallet
3. Connect with Leo Wallet
4. Try again

## Next Steps

1. **Share Console Logs**
   - Copy full console output
   - Share the "PLACE BET DEBUG" section
   - Share any error messages

2. **Check Wallet**
   - Which wallet are you using? (Leo/Puzzle/Fox)
   - What network? (Testnet/Testnet Beta)
   - What's your balance?

3. **Verify Setup**
   - Is program deployed?
   - Is market ID valid?
   - Is wallet connected?

## Quick Test

Try this in console:
```javascript
// Check wallet connection
console.log('Wallet:', useWalletStore.getState().wallet);

// Check market
console.log('Market:', useMarketsStore.getState().selectedMarket);

// Check if Leo Wallet
console.log('Using Leo?', useWalletStore.getState().wallet.walletType === 'leo');
```

Share the output!
