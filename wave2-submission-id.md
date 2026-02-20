# Veiled Markets — Submission Wave 2

## 1. Gambaran Proyek

**Nama:** Veiled Markets
**Live Demo:** https://veiledmarkets.xyz
**Kontrak:** [`veiled_markets_v16.aleo`](https://testnet.explorer.provable.com/program/veiled_markets_v16.aleo)
**GitHub:** https://github.com/hevDev7/veiled-markets-near

### Masalah

Prediction market adalah alat yang powerful untuk penemuan informasi, tetapi platform yang ada (Polymarket, Kalshi) mengekspos identitas, posisi, dan ukuran trading setiap peserta secara on-chain atau di order book publik. Ini menciptakan masalah nyata:

- **Front-running & MEV:** Taruhan yang terlihat memungkinkan bot mengekstrak nilai dari pengguna biasa.
- **Tekanan sosial:** Peserta di market yang sensitif secara politis menghadapi risiko pembalasan ketika posisi mereka terlihat publik.
- **Sensor diri:** Pengguna menghindari market tentang topik kontroversial karena wallet mereka terhubung dengan taruhan mereka.

Arsitektur zero-knowledge Aleo menyelesaikan ini dengan membiarkan kontrak memverifikasi kebenaran tanpa mengungkapkan siapa yang bertaruh apa.

### Mengapa Privasi Penting

Dalam prediction market, privasi bukan kemewahan — ini prasyarat untuk partisipasi yang jujur. Ketika outcome-nya sensitif (pemilu, peristiwa korporat, ramalan geopolitik), taruhan publik menjadi sinyal yang mendistorsi hal yang ingin diukur oleh market itu sendiri. Veiled Markets memastikan jumlah transaksi, pilihan outcome, dan identitas pemenang tersembunyi melalui private record Aleo dan zero-knowledge proof, menghasilkan sinyal harga yang lebih bersih.

### Product Market Fit & Go-To-Market

**Target pengguna:** Trader crypto-native yang sudah menggunakan prediction market tetapi menginginkan privasi posisi; peserta governance DAO yang membutuhkan signaling tanpa paksaan; analis dan peneliti yang membutuhkan estimasi probabilitas jujur dari crowd.

**Tesis PMF:** Prediction market yang menjaga privasi adalah ceruk yang belum terlayani — tidak ada produk live yang menawarkan taruhan sepenuhnya privat dengan pricing berbasis AMM di chain ZK-native. Veiled Markets adalah prediction market FPMM pertama di Aleo.

**Rencana GTM:**
- **Wave 2–4:** Bangun traksi via Aleo testnet dengan market terbuka, kumpulkan feedback dari komunitas Aleo dan juri buildathon.
- **Wave 5–7:** Luncurkan creator tools agar siapa saja bisa deploy market. Integrasi dengan ekosistem DeFi Aleo (USDCX, USAD stablecoin). Terbitkan TypeScript SDK untuk embedding pihak ketiga.
- **Wave 8–10:** Deployment mainnet. Bermitra dengan DAO untuk prediction market governance. Target liputan media crypto untuk peluncuran.

---

## 2. Demo Berfungsi

| Komponen | Status | Link |
|----------|--------|------|
| Frontend | Live | https://veiledmarkets.xyz |
| Kontrak (Testnet) | Deployed | [`veiled_markets_v16.aleo`](https://testnet.explorer.provable.com/program/veiled_markets_v16.aleo) |
| Integrasi Wallet | Shield Wallet (utama), Leo Wallet, Puzzle Wallet | Terhubung via adapter ProvableHQ |

**Fitur utama yang bisa ditest dari UI:**
- Buat Market dengan likuiditas awal ALEO (memanggil `credits.aleo/transfer_public_as_signer`)
- Beli Shares secara privat via `buy_shares_private` (memanggil `credits.aleo/transfer_private_to_public`)
- Jual Shares via `sell_shares` (memanggil `credits.aleo/transfer_public_to_private`)
- Resolusi Market (alur 3 langkah Close → Resolve → Finalize)
- Dispute Resolution (bond 1 ALEO via private credits record)
- Klaim Kemenangan / Klaim Refund (pembayaran privat via `transfer_public_to_private`)
- Dukungan dual-token: ALEO dan USDCX (`test_usdcx_stablecoin.aleo`)

**Integrasi Shield Wallet:** Shield Wallet terintegrasi sebagai wallet utama. Semua alur transaksi (buat market, beli shares, jual shares, resolve, dispute, klaim) bekerja melalui adapter ProvableHQ Shield dengan `executeTransaction()`. Shield menangani otorisasi signer bersarang untuk transisi anak seperti `credits.aleo/transfer_public_as_signer`. Alur koneksi wallet mendeteksi Shield secara otomatis melalui injeksi `window.shield` / `window.shieldWallet` dan terhubung dengan `DecryptPermission.AutoDecrypt` di jaringan `testnetbeta`.

---

## 3. Dokumentasi Teknis

**Repository GitHub:** https://github.com/hevDev7/veiled-markets-near

### Arsitektur

```
┌──────────────┐     ┌───────────────────────┐     ┌──────────────────┐
│   Frontend   │────▶│   Shield / Leo /      │────▶│   Aleo Testnet   │
│  React/Vite  │     │   Puzzle Wallet       │     │                  │
│  TypeScript  │     │  (adapter ProvableHQ) │     │  veiled_markets  │
│              │     └───────────────────────┘     │  _v16.aleo       │
│  Komponen:   │                                   │                  │
│  - Dashboard │     ┌───────────────────────┐     │  Dependensi:     │
│  - Market    │────▶│  Supabase (terenkripsi)│     │  - credits.aleo  │
│  - My Bets   │     │  Sinkronisasi bet     │     │  - test_usdcx_   │
│  - Resolve   │     └───────────────────────┘     │    stablecoin    │
└──────────────┘                                   └──────────────────┘
```

- **Kontrak (Leo):** 30 transisi, AMM FPMM (complete-set minting/burning), market 2–4 outcome, LP provision, mekanisme dispute, multi-sig treasury.
- **Frontend (React/Vite/TS):** Wallet-agnostik via pola adapter. Dukungan WASM dengan header COOP/COEP untuk `@provablehq/sdk`.
- **Storage:** Supabase dengan enkripsi AES-256-GCM di sisi client untuk sinkronisasi data bet antar perangkat. Field sensitif (outcome, amount, shares) dienkripsi dengan kunci yang diturunkan dari wallet sebelum disimpan.

### Model Privasi

Semua transfer nilai menggunakan sistem private record Aleo:

| Operasi | Metode Privasi | Apa yang Tersembunyi |
|---------|---------------|---------------------|
| Beli shares | `transfer_private_to_public` (user → program) | Alamat pembeli, jumlah |
| Jual shares | `transfer_public_to_private` (program → user) | Alamat penjual, jumlah diterima |
| Tukar kemenangan | `transfer_public_to_private` (program → user) | Identitas pemenang, jumlah payout |
| Klaim refund | `transfer_public_to_private` (program → user) | Penerima refund |
| Tambah likuiditas | `transfer_private_to_public` (user → program) | Identitas LP, jumlah deposit |
| Bond dispute | `transfer_private_to_public` (user → program) | Identitas disputer |

Record `OutcomeShare` adalah record privat Aleo — hanya wallet pemilik yang bisa mendekripsi pilihan outcome dan jumlah share. Di on-chain, pengamat hanya melihat alamat program sebagai counterparty.

---

## 4. Catatan Perubahan (Wave 2)

### Apa yang Dibangun Sejak Wave 1

Sejak Wave 1 (v2), kami mengirimkan **14 iterasi kontrak** dan men-deploy `veiled_markets_v16.aleo` di Aleo Testnet, menghadirkan siklus trading lengkap:

**Mesin AMM FPMM:** Mengganti model parimutuel dengan Fixed Product Market Maker ala Gnosis. Complete-set minting untuk pembelian, pendekatan `tokens_desired` untuk penjualan (menghindari `sqrt` on-chain). Mendukung market 2, 3, dan 4 outcome. Fee per-trade: 0,5% protokol + 0,5% kreator + 1% LP = 2% total.

**Overhaul Privasi Penuh:** Enam transisi ditingkatkan untuk menggunakan record `credits.aleo` privat:
- `buy_shares_private` → `transfer_private_to_public` (pembeli tersembunyi)
- `sell_shares` → `transfer_public_to_private` (penjual tersembunyi)
- `redeem_shares` → `transfer_public_to_private` (pemenang tersembunyi)
- `claim_refund` → `transfer_public_to_private` (penerima tersembunyi)
- `add_liquidity` → `transfer_private_to_public` (LP tersembunyi)
- `dispute_resolution` → `transfer_private_to_public` (disputer tersembunyi)

**Dual-Token Markets:** Dukungan ALEO (beli sepenuhnya privat) dan USDCX (`test_usdcx_stablecoin.aleo`). Tipe token diatur saat pembuatan market.

**UI Resolusi Market:** Tab Resolve 3 langkah (Close → Resolve → Finalize) dengan status TX langsung, hitung mundur blok, deteksi Emergency Cancel, dan alur Dispute lengkap.

**Integrasi Shield Wallet:** Shield Wallet adalah wallet utama, menangani semua alur transaksi termasuk transisi anak `credits.aleo` bersarang. Leo Wallet dan Puzzle Wallet juga didukung melalui pola adapter.

**Klaim & Pelacakan:** Merombak My Bets dengan tab Unredeemed, penukaran share berbasis wallet, filter "Needs Resolution", dan timer hitung mundur langsung.

### Feedback Wave 1 yang Ditindaklanjuti

Reviewer (alex_aleo) mengangkat tiga masalah — semua telah diselesaikan:

1. **Kebocoran privasi pada fungsi betting** — `place_bet` mengekspos alamat user via `transfer_public_as_signer`. Diperbaiki: `buy_shares_private` kini menggunakan `transfer_private_to_public` dengan credits record privat. Alamat user sepenuhnya tersembunyi.

2. **Model payout tidak mencerminkan odds saat bet** — Model parimutuel diganti dengan FPMM. Harga diturunkan dari cadangan pool saat transaksi, dan record `OutcomeShare` menyimpan jumlah share yang dihitung oleh formula FPMM.

3. **Create market stuck loading** — Ditambahkan guard `isSubmitting` + tombol dinonaktifkan untuk mencegah double-submission. Deployment produksi stabil.

### Keterbatasan / Fitur yang Belum Selesai

- **Privasi beli USDCX:** Market USDCX menggunakan `transfer_public_as_signer` (alamat pembeli terlihat). Kontrak stablecoin sebenarnya mendukung `transfer_private_to_public`, tetapi memerlukan Merkle proof freeze-list (2x tree 16-depth) yang belum diintegrasikan di kontrak kami. Direncanakan untuk Wave 5.
- **UI multi-outcome:** Kontrak mendukung market 3 dan 4 outcome, tetapi alur beli/jual di frontend saat ini hanya merender market biner (Yes/No). UI multi-outcome direncanakan untuk Wave 3.
- **UI LP Provision:** Transisi `add_liquidity` dan `remove_liquidity` ada di on-chain tetapi belum memiliki UI frontend. Direncanakan untuk Wave 5.
- **Responsivitas mobile:** Frontend dioptimalkan untuk desktop. Perbaikan layout mobile direncanakan untuk Wave 5.
- **Indexer/analytics:** Belum ada backend indexer untuk data historis market atau analytics volume. Direncanakan untuk Wave 3–4.

### Target Wave Selanjutnya (Wave 3)

- UI lengkap untuk market 3 dan 4 outcome (beli/jual/breakdown pool)
- Halaman analytics market (tren volume, statistik partisipasi)
- Halaman profil pengguna (riwayat betting, pelacakan PnL)
- Dukungan frontend untuk input credits record privat pada `add_liquidity` dan `dispute_resolution`
- Dokumentasi API dan panduan self-hosting
