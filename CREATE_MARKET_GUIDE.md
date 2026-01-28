s

---

## Summary

```bash
# 1. Generate hash
node scripts/generate-question-hash.js "Your question?"

# 2. Create market
./contracts/create-new-market.sh

# 3. Update indexer (backend/src/indexer.ts)
# 4. Update mapping (frontend/src/lib/question-mapping.ts)

# 5. Regenerate index
cd backend && npm run index

# 6. Copy to frontend
cp backend/public/markets-index.json frontend/public/

# 7. Restart frontend
cd frontend && npm run dev
```

Done! 🎉
 by [Date]?"
- "Will Fed cut rates in [Quarter] 2026?"

### Science (7)
- "Will [Mission] successfully [Goal] in 2026?"
- "Will [Discovery] be announced in 2026?"

---

## Best Practices

1. **Clear Questions**: Make questions unambiguous
2. **Verifiable Outcomes**: Ensure outcome can be objectively verified
3. **Reasonable Deadlines**: Give enough time for betting and resolution
4. **Proper Categories**: Use correct category for discoverability
5. **Document Everything**: Save transaction IDs and market ID [Milestone] by 2026?"

### Economics (6)
- "Will inflation drop below [X]%
### Politics (1)
- "Will [Candidate] win the 2026 election?"
- "Will [Policy] be passed by Congress in 2026?"

### Sports (2)
- "Will [Team] win [Championship] 2026?"
- "Will [Player] break [Record] in 2026?"

### Crypto (3)
- "Will [Coin] reach $[Price] by [Date]?"
- "Will [Protocol] launch on mainnet in 2026?"

### Entertainment (4)
- "Will [Movie] gross over $[Amount] in 2026?"
- "Will [Artist] release new album in 2026?"

### Tech (5)
- "Will [Company] release [Product] in 2026?"
- "Will [Technology] achieveblocks
- 7 days = 40,320 blocks
- 10 days = 57,600 blocks

---

## Example Questions by Category
ic/

### Pertanyaan muncul sebagai hash
- Check question-mapping.ts sudah diupdate
- Clear localStorage: `localStorage.clear()`
- Refresh browser

### Transaction failed
- Check wallet balance (need credits for fees)
- Verify network connection
- Check block height masih valid (deadline > current block)

---

## Categories

```
1 = Politics
2 = Sports
3 = Crypto
4 = Entertainment
5 = Tech
6 = Economics
7 = Science
```

---

## Block Time Calculation

- 1 block ≈ 15 seconds
- 1 hour = 240 blocks
- 1 day = 5,760 v server (Ctrl+C)
npm run dev
```

---

## Step 8: Verify

1. Buka browser: http://localhost:3000
2. Connect wallet
3. Cek dashboard - market baru harus muncul
4. Klik market - pertanyaan harus readable: "Will Ethereum reach $10,000 by end of Q2 2026?"
5. Cek "Verify On-Chain" link - harus mengarah ke transaction yang benar

---

## Troubleshooting

### Market tidak muncul di dashboard
- Clear browser cache (Ctrl+Shift+R)
- Check console untuk errors
- Verify markets-index.json sudah ter-copy ke frontend/publtep 7: Restart Frontend

```bash
cd frontend
# Stop de
    // ... existing mappings ...
    
    // NEW MARKET - Ethereum $10k
    '418949ee51a9efadf89de7d4cd78ca69f930969f917877693d8de8725ed7e2field': 
      'Will Ethereum reach $10,000 by end of Q2 2026?',
  };
  
  // ... rest of function ...
}
```

---

## Step 5: Regenerate Index

```bash
cd backend
npm run index
```

Output:
```
✅ Indexing completed successfully!
📊 Total markets indexed: 9
```

---

## Step 6: Copy to Frontend

```bash
cp backend/public/markets-index.json frontend/public/
```

---

## Srt function initializeQuestionMappings(): void {
  const mappings: Record<string, string> = {];
```

---

## Step 4: Update Question Mapping

Edit `frontend/src/lib/question-mapping.ts` dan tambahkan mapping:

```typescript
expoto
        deadline: '14107391u64',
        resolutionDeadline: '14124671u64',
        createdAt: Date.now(),
        blockHeight: 14067000,
    },
KETS`:

```typescript
const KNOWN_MARKETS: IndexedMarket[] = [
    // ... existing markets ...
    
    // NEW MARKET - Ethereum $10k
    {
        marketId: '9876543210987654321098765432109876543210987654321098765432109876field', // Dari output Leo
        transactionId: 'at1abc123...xyz789', // Dari output Leo
        creator: 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8',
        questionHash: '418949ee51a9efadf89de7d4cd78ca69f930969f917877693d8de8725ed7e2field',
        category: 3, // Crype51a9efadf89de7d4cd78ca69f930969f917877693d8de8725ed7e2field" \
  "3u8" \
  "${BETTING_DEADLINE}u64" \
  "${RESOLUTION_DEADLINE}u64" \
  --broadcast
```

### Output yang Perlu Dicatat:

```
✅ Transaction broadcast successfully!

Transaction ID: at1abc123...xyz789
Market ID: 9876543210987654321098765432109876543210987654321098765432109876field
```

**PENTING:** Simpan Transaction ID dan Market ID!

---

## Step 3: Update Backend Indexer

Edit `backend/src/indexer.ts` dan tambahkan market baru ke array `KNOWN_MAR7600))  # 10 days

leo execute create_market \
  "418949eENT_BLOCK + 5 via Leo CLI

### Option A: Menggunakan Script (Recommended)

```bash
chmod +x contracts/create-new-market.sh
./contracts/create-new-market.sh
```

Script ini akan:
- Menampilkan detail market
- Meminta konfirmasi
- Execute transaction ke blockchain
- Memberikan instruksi next steps

### Option B: Manual Command

```bash
cd contracts

# Get current block height from: https://testnet.explorer.provable.com/
CURRENT_BLOCK=14067000
BETTING_DEADLINE=$((CURRENT_BLOCK + 40320))  # 7 days
RESOLUTION_DEADLINE=$((CURR2 2026?"
```

Output:
```
📝 Question Hash Generator
============================================================

Question:
  "Will Ethereum reach $10,000 by end of Q2 2026?"

Hash:
  418949ee51a9efadf89de7d4cd78ca69f930969f917877693d8de8725ed7e2field

✅ Use this hash in your leo execute command:
  leo execute create_market "418949ee51a9efadf89de7d4cd78ca69f930969f917877693d8de8725ed7e2field" "3u8" "14124471u64" "14141751u64" --broadcast
```

---

## Step 2: Create Market
## Overview

Untuk membuat market baru di Veiled Markets, Anda perlu:
1. Generate question hash dari pertanyaan
2. Deploy market ke blockchain via Leo CLI
3. Update indexer dengan market baru
4. Update question mapping untuk display

---

## Step 1: Generate Question Hash

Question hash adalah SHA-256 hash dari pertanyaan market Anda.

### Menggunakan Script Node.js:

```bash
node scripts/generate-question-hash.js "Will Ethereum reach $10,000 by end of Q# 📝 Guide: Create Market dengan Cara yang Benar
