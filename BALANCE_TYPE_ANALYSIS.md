# 💰 Analisis: Balance Type untuk Betting

## 🔍 Jawaban: Balance yang Digunakan

**❌ BUKAN Private Balance**  
**✅ Menggunakan PUBLIC Balance**

## 📊 Detail Implementasi

### Di Kontrak (`place_bet`):

```leo
let transfer_future: Future = credits.aleo/transfer_public_as_signer(
    veiled_markets_privacy.aleo,  // recipient
    amount                         // amount in microcredits
);
```

**`transfer_public_as_signer`** berarti:
- ✅ Menggunakan **PUBLIC balance** (dari mapping `account[address]`)
- ❌ **BUKAN** private records
- Transfer dari public balance user ke program

## 🔄 Perbedaan Balance Types di Aleo

### 1. Public Balance
- Disimpan di mapping `account[address] => u64`
- Terlihat publik di blockchain
- Digunakan untuk: `transfer_public`, `transfer_public_as_signer`
- **Ini yang digunakan untuk bet saat ini**

### 2. Private Balance (Records)
- Disimpan sebagai encrypted records
- Hanya owner yang bisa decrypt
- Digunakan untuk: `transfer_private`, `transfer_private_to_public`
- **TIDAK digunakan untuk bet saat ini**

## ⚠️ Masalah yang Mungkin Terjadi

### Jika User Hanya Punya Private Credits:

1. **Bet akan gagal** karena `transfer_public_as_signer` mencari di public balance
2. **Public balance = 0** → Transaction rejected
3. **Error:** Insufficient balance atau transfer failed

### Solusi: Convert Private ke Public

User perlu convert private credits ke public balance dulu:

```bash
# Convert private record ke public balance
leo execute credits.aleo/transfer_private_to_public \
  <private_record> \
  <user_address> \
  <amount>u64 \
  --network testnet \
  --broadcast
```

## 💡 Rekomendasi Perbaikan

### Option 1: Tambahkan Support Private Balance (Recommended)

Modifikasi kontrak untuk menerima private credits record:

```leo
async transition place_bet_with_private(
    public market_id: field,
    private credits_in: credits.aleo/credits,  // Private record
    public outcome: u8,
) -> (Bet, credits.aleo/credits, Future) {
    // Validate amount
    let amount: u64 = credits_in.microcredits;
    assert(amount >= MIN_BET_AMOUNT);
    
    // Transfer private to public first
    let transfer_future: Future = credits.aleo/transfer_private_to_public(
        veiled_markets_privacy.aleo,
        amount
    );
    
    // Then proceed with bet
    // ...
}
```

### Option 2: Frontend Auto-Convert

Frontend bisa auto-convert private credits ke public sebelum bet:

```typescript
// Check if user has enough public balance
const publicBalance = await getPublicBalance(address);
if (publicBalance < betAmount) {
    // Convert private credits to public
    await convertPrivateToPublic(privateRecord, betAmount);
}
```

### Option 3: Update Dokumentasi

Tambahkan warning di UI bahwa bet menggunakan public balance.

## 📝 Current Behavior

### Untuk Bet:
- ✅ Menggunakan **PUBLIC balance**
- ❌ Tidak menggunakan private records
- ⚠️ User perlu convert private → public dulu jika hanya punya private credits

### Untuk Winnings:
- Menggunakan `transfer_public` → kembali ke public balance
- Bisa kemudian convert ke private jika mau

## 🎯 Kesimpulan

**Bet menggunakan PUBLIC balance, bukan private balance.**

Jika bet di-reject karena insufficient balance, kemungkinan:
1. Public balance tidak cukup
2. User hanya punya private credits
3. Perlu convert private → public dulu

---

**Rekomendasi:** Tambahkan support untuk private balance atau auto-convert di frontend.
