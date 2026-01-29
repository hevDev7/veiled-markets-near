# Balance Not Updating After Bet - Fix & Explanation

## 🔍 Problem

Balance di wallet tidak berkurang setelah place bet, padahal transaction berhasil.

## 🤔 Penyebab

### 1. Aleo Private Records System
Aleo menggunakan **private records** untuk transaksi:
- Balance tersimpan dalam **encrypted records**
- Wallet perlu **decrypt records** untuk update balance
- Process ini butuh waktu (tidak instant)

### 2. Wallet Sync Delay
Leo Wallet perlu:
- Query blockchain untuk records baru
- Decrypt records dengan view key
- Update internal balance cache
- Ini bisa butuh 30-60 detik atau lebih

### 3. Public vs Private Balance
Ada 2 jenis balance di Aleo:
- **Public balance**: Visible on-chain, jarang digunakan untuk bets
- **Private balance**: Encrypted records, digunakan untuk privacy

Kemungkinan:
- Bet menggunakan **private records**
- UI menampilkan **public balance** (tidak berubah)
- Private balance berkurang tapi belum ter-refresh

## ✅ Solutions Implemented

### 1. Auto-Refresh Balance
Added multiple refresh attempts after bet:
```typescript
// Immediate refresh
setTimeout(() => refreshBalance(), 1000)

// Periodic refreshes
[3000, 5000, 10000, 15000, 30000].forEach(delay => {
  setTimeout(() => refreshBalance(), delay)
})
```

### 2. Enhanced Logging
Added detailed logging to track balance changes:
```
=== REFRESHING BALANCE ===
Current balance: { public: 10000000, private: 5000000 }
New balance: { public: 10000000, private: 3000000 }
✅ Balance changed!
Difference: -2000000 (2 ALEO spent)
```

### 3. Balance Display Improvements
Shows both public and private balance separately

## 🧪 Testing Steps

### Test 1: Check Balance Before Bet
1. Open browser console (F12)
2. Check current balance
3. Note the amount

### Test 2: Place Bet
1. Place a bet (e.g., 2 ALEO)
2. Approve in wallet
3. Watch console logs

### Test 3: Monitor Balance Updates
Look for console logs:
```
Bet transaction submitted: at1...
Refreshing balance immediately after bet...
=== REFRESHING BALANCE ===
Current balance: { public: 0, private: 10000000 }
Refreshing balance after 3000ms...
=== REFRESHING BALANCE ===
New balance: { public: 0, private: 7500000 }
✅ Balance changed!
Difference: -2500000 (2.5 ALEO spent: 2 bet + 0.5 fee)
```

### Test 4: Manual Refresh
If balance still not updated:
1. Wait 60 seconds
2. Refresh page (F5)
3. Check balance again
4. Or disconnect and reconnect wallet

## 📊 Expected Behavior

After placing 2 ALEO bet with 0.5 ALEO fee:

**Before:**
- Private balance: 10 ALEO

**After (should be):**
- Private balance: 7.5 ALEO
- Spent: 2.5 ALEO (2 bet + 0.5 fee)

## ⚠️ Common Issues

### Issue 1: Balance Shows Same Amount
**Cause**: Wallet hasn't synced yet

**Fix**:
1. Wait 30-60 seconds
2. Check console for refresh logs
3. Manually refresh page
4. Check wallet extension directly

### Issue 2: Only Public Balance Shown
**Cause**: Private records not fetched

**Fix**:
1. Wallet needs AutoDecrypt permission
2. Reconnect wallet with proper permissions
3. Check Leo Wallet settings

### Issue 3: Balance Never Updates
**Cause**: Wallet sync issue or network problem

**Fix**:
1. Check wallet is on correct network (Testnet Beta)
2. Check wallet extension is working
3. Try disconnect and reconnect
4. Check balance directly in wallet extension

## 🔧 Manual Balance Check

### In Browser Console:
```javascript
// Check current balance
console.log(useWalletStore.getState().wallet.balance)

// Manual refresh
await useWalletStore.getState().refreshBalance()

// Check again
console.log(useWalletStore.getState().wallet.balance)
```

### In Leo Wallet Extension:
1. Open Leo Wallet
2. Check balance there
3. Should show updated amount
4. If not, wallet needs to sync

### Via API:
```bash
# Check public balance
curl "https://api.explorer.provable.com/v1/testnet/program/credits.aleo/mapping/account/YOUR_ADDRESS"

# Note: Private balance cannot be checked via API (it's encrypted!)
```

## 💡 Understanding Aleo Balance

### Public Balance
- Visible on blockchain
- Anyone can query
- Used for: fees, public transfers
- **Not used for private bets**

### Private Balance
- Encrypted records
- Only you can decrypt (with view key)
- Used for: private bets, private transfers
- **This is what decreases when you bet**

### Why Balance Might Not Update:

1. **Wallet Cache**: Wallet caches balance, needs refresh
2. **Record Sync**: New records need to be fetched and decrypted
3. **Network Delay**: Blockchain needs time to process
4. **View Key**: Wallet needs view key to decrypt records

## ✅ Verification

To verify bet actually went through:

### 1. Check Transaction on Explorer
```
https://testnet.explorer.provable.com/transaction/YOUR_TX_ID
```
Should show:
- ✅ Transaction confirmed
- ✅ Inputs include your bet amount
- ✅ Fee deducted

### 2. Check Market Pool
```bash
curl "https://api.explorer.provable.com/v1/testnet/program/veiled_markets.aleo/mapping/market_pools/MARKET_ID"
```
Should show:
- ✅ Pool increased by your bet amount
- ✅ Total bets increased

### 3. Check Wallet Records
In Leo Wallet:
- Go to "Records" or "Activity"
- Should show bet transaction
- Balance should reflect the spend

## 🎯 Recommendations

### For Users:
1. **Be patient**: Balance update can take 30-60 seconds
2. **Check wallet extension**: Most accurate balance
3. **Verify on explorer**: Confirm transaction went through
4. **Refresh page**: If balance stuck after 2 minutes

### For Developers:
1. **Show pending state**: Indicate balance is updating
2. **Add manual refresh button**: Let users trigger refresh
3. **Show transaction status**: "Pending", "Confirmed", etc.
4. **Display both balances**: Public and private separately

## 🚀 Next Steps

If balance still not updating after 5 minutes:

1. **Check wallet extension directly**
   - Open Leo Wallet
   - Check balance there
   - Should be accurate

2. **Verify transaction confirmed**
   - Check explorer
   - Confirm transaction status

3. **Reconnect wallet**
   - Disconnect
   - Connect again
   - Should trigger full sync

4. **Check network**
   - Ensure on Testnet Beta
   - Check wallet settings

## 📝 Summary

Balance tidak update instantly karena:
- ✅ Aleo menggunakan private records (encrypted)
- ✅ Wallet perlu sync dan decrypt records
- ✅ Process butuh waktu 30-60 detik
- ✅ Auto-refresh sudah diimplementasikan
- ✅ Manual refresh juga bisa dilakukan

**Balance AKAN update**, hanya butuh waktu! ⏱️

Cek di wallet extension untuk balance paling akurat! 🎯
