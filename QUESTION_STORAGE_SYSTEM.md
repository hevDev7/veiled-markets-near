# Question Storage System - Veiled Markets

## Overview

Pertanyaan market di Veiled Markets **TIDAK sepenuhnya hardcoded**. Sistem menggunakan pendekatan hybrid untuk efisiensi blockchain dan user experience.

## Bagaimana Sistem Bekerja

### 1. On-Chain Storage (Blockchain)
```
✅ Disimpan: Question Hash (field)
❌ TIDAK Disimpan: Teks pertanyaan lengkap
```

**Alasan:**
- Efisiensi: Hash lebih kecil (32 bytes) vs teks lengkap (ratusan bytes)
- Privacy: Hash tidak mengungkapkan isi pertanyaan langsung
- Cost: Lebih murah untuk menyimpan hash di blockchain

### 2. Off-Chain Storage (localStorage)
```javascript
{
  "3582024152336217571382682973364798990155453514672503623063651091171230848724field": 
    "Will Ethereum reach $10,000 by end of Q2 2026?"
}
```

**Lokasi:** Browser localStorage dengan key `veiled_markets_questions`

**Kapan Disimpan:**
- Saat user membuat market baru (via `registerQuestionText()`)
- Saat app startup (via `initializeQuestionMappings()` untuk market yang sudah ada)

### 3. Fallback Hardcode (Hanya untuk Market Lama)

File: `frontend/src/lib/question-mapping.ts`

```typescript
export function initializeQuestionMappings(): void {
    const mappings: Record<string, string> = {
        // Hanya market yang sudah ada sebelumnya
        '3582024152336217571382682973364798990155453514672503623063651091171230848724field':
            'Will Ethereum reach $10,000 by end of Q2 2026?',
    };
    // ...
}
```

**Tujuan:** Memastikan market yang sudah ada tetap bisa ditampilkan dengan benar

## Alur Pembuatan Market Baru

```
1. User mengisi form "Create Market"
   ↓
2. Question text di-hash menggunakan SHA-256
   ↓
3. Hash dikirim ke blockchain (on-chain)
   ↓
4. Question text disimpan di localStorage (off-chain)
   ↓
5. Market muncul di dashboard dengan teks lengkap
```

## Kode Penting

### Saat Membuat Market:
```typescript
// CreateMarketModal.tsx
const questionHash = await hashToField(formData.question)
registerQuestionText(questionHash, formData.question) // Simpan ke localStorage
```

### Saat Menampilkan Market:
```typescript
// aleo-client.ts
export function getQuestionText(questionHash: string): string {
  const saved = localStorage.getItem('veiled_markets_questions');
  const mappings = JSON.parse(saved);
  return mappings[questionHash] || `Market ${questionHash.slice(0, 16)}...`;
}
```

## Keuntungan Sistem Ini

✅ **Efisien**: Blockchain hanya menyimpan hash kecil
✅ **Fleksibel**: User bisa membuat market dengan pertanyaan apapun
✅ **Privacy-Preserving**: Hash tidak langsung mengungkapkan pertanyaan
✅ **User-Friendly**: Teks lengkap tetap ditampilkan di UI
✅ **Decentralized**: Siapapun bisa verify hash dengan pertanyaan asli

## Limitasi

⚠️ **localStorage bersifat lokal**: Jika user clear browser data, mapping hilang
⚠️ **Fallback ke hash**: Jika mapping tidak ditemukan, tampilkan hash saja

## Solusi untuk Produksi

Untuk production, pertimbangkan:

1. **IPFS Storage**: Simpan mapping di IPFS, hash IPFS di blockchain
2. **Indexer Service**: Backend service yang track semua market dan question text
3. **Event Logs**: Parse transaction logs untuk extract question text
4. **Decentralized Storage**: Arweave, Filecoin, dll

## Verifikasi

User bisa verify bahwa question text sesuai dengan hash:

```bash
# Generate hash dari question
node scripts/generate-question-hash.js "Will Ethereum reach $10,000 by end of Q2 2026?"

# Output:
# 3582024152336217571382682973364798990155453514672503623063651091171230848724field

# Bandingkan dengan hash di blockchain
```

## Kesimpulan

**Pertanyaan TIDAK hardcoded** - sistem menggunakan:
- ✅ On-chain hash (immutable, verifiable)
- ✅ Off-chain text storage (localStorage)
- ✅ Fallback hardcode (hanya untuk market yang sudah ada)

Setiap market baru yang dibuat akan otomatis tersimpan di localStorage user yang membuatnya, dan bisa di-share melalui indexer atau IPFS di masa depan.
