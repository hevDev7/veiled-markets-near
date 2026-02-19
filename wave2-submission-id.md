# Veiled Markets — Submission Wave 2

## Pembaruan di Wave Ini

**Live Demo:** https://veiledmarkets.xyz
**Kontrak:** [`veiled_markets_v16.aleo`](https://testnet.explorer.provable.com/program/veiled_markets_v16.aleo)

Sejak Wave 1 (v2), kami telah mengirimkan 14 iterasi kontrak dan men-deploy `veiled_markets_v16.aleo` di Aleo Testnet, menghadirkan siklus trading lengkap — beli, jual, resolusi, dispute, dan klaim — seluruhnya on-chain dengan integrasi wallet.

**Private Buy:** `buy_shares_private` memanggil `credits.aleo/transfer_private_to_public` secara internal. Alamat dan jumlah transaksi pengguna tidak pernah terekspos di on-chain; posisi yang dibeli dikembalikan sebagai record `OutcomeShare` terenkripsi di wallet, menjaga pilihan outcome dan jumlahnya tetap sepenuhnya privat.

**Sell Shares:** `sell_shares` menggunakan pendekatan `tokens_desired` — pengguna menentukan jumlah collateral yang ingin diterima, dan kontrak menghitung shares yang dibutuhkan melalui formula FPMM, menghindari komputasi `sqrt` on-chain. Collateral dikembalikan sebagai record `credits.aleo` privat melalui `transfer_public_to_private`, menyembunyikan identitas penjual dan jumlah yang diterima.

**Penguatan Privasi:** Lima transisi tambahan ditingkatkan ke privasi penuh. `redeem_shares` dan `claim_refund` kini menggunakan `transfer_public_to_private` — identitas pemenang dan penerima refund sepenuhnya tersembunyi. `add_liquidity` dan `dispute_resolution` kini menerima record `credits.aleo` privat sebagai input melalui `transfer_private_to_public` — deposit LP dan bond dispute tidak lagi mengekspos alamat on-chain. Transisi `withdraw_lp_resolved` ditambahkan untuk menutup jalur yang hilang di mana token LP tidak memiliki rute penarikan setelah resolusi market.

**Dual-Token Markets:** Kreator memilih ALEO (`1u8`) atau USDCX (`2u8`) saat pembuatan market. Market ALEO sepenuhnya privat di sisi beli; market USDCX menggunakan `transfer_public_as_signer`, sehingga alamat pembeli terlihat. Biaya gas selalu dalam ALEO terlepas dari jenis token.

**Market Resolution:** Tab Resolve 3-langkah memandu resolver melalui Close → Resolve → Finalize dengan status TX langsung dan hitung mundur blok. Panel otomatis mendeteksi market yang kedaluwarsa tanpa resolusi dan menampilkan banner Emergency Cancel. Alur Dispute lengkap memungkinkan siapa saja menaruh bond 1 ALEO untuk menantang outcome resolusi.

**Klaim & Pelacakan:** Merombak `ClaimWinningsModal` dan My Bets dengan tab Unredeemed untuk penukaran saham dan klaim pengembalian dana berbasis wallet. Dashboard mendapatkan filter "Needs Resolution" dan timer hitung mundur langsung yang diperbarui setiap detik dari block height.

**Deployment:** Live di https://veiledmarkets.xyz dengan build stabil dan header COOP/COEP untuk dukungan WASM.

---

## Menanggapi Feedback Wave 1

Reviewer Wave 1 (alex_aleo) mengangkat tiga masalah spesifik, yang semuanya telah diselesaikan pada wave ini:

**1. Kebocoran privasi pada fungsi betting** — Reviewer mencatat bahwa `place_bet` memanggil `transfer_public_as_signer` yang mengekspos alamat dan jumlah pengguna di on-chain, dan merekomendasikan penggunaan Credits record privat dengan `transfer_private_to_public`. Hal ini telah diimplementasikan sepenuhnya: transisi `buy_shares_private` yang baru menerima record `credits.aleo` privat dari pengguna dan memanggil `transfer_private_to_public` secara internal. Alamat wallet dan jumlah transaksi pengguna kini sepenuhnya tersembunyi — hanya alamat program yang terlihat sebagai penerima di on-chain.

**2. Model payout tidak mencerminkan odds saat bet dilakukan** — Model payout parimutuel yang digunakan di v2 tidak mencerminkan harga pada saat transaksi. Ini telah diganti dengan **FPMM (Fixed Product Market Maker) ala Gnosis** di v14/v16. Harga implied kini diturunkan dari cadangan pool pada saat transaksi berlangsung, dan record `OutcomeShare` menyimpan jumlah saham yang dihitung oleh formula FPMM saat eksekusi — memberikan posisi yang adil dan akurat secara harga kepada pengguna.

**3. Create market stuck loading** — Guard pengiriman (`isSubmitting` state + tombol dinonaktifkan setelah klik pertama) telah ditambahkan untuk mencegah double-submission. Deployment produksi kini stabil dengan market terbuka untuk trading di https://veiledmarkets.xyz.

---

*Program ini terdiri dari 10 gelombang. Milestone didistribusikan secara bertahap di seluruh gelombang yang tersisa.*

## Peningkatan Privasi yang Diimplementasikan

Semua lima upgrade privasi prioritas tinggi diimplementasikan di wave ini. Kontrak kini menggunakan `transfer_public_to_private` (program mengembalikan record credits privat ke pengguna) dan `transfer_private_to_public` (pengguna menyediakan record credits privat ke program) di seluruh transisi:

**Prioritas 1 — `redeem_shares` → `transfer_public_to_private`** *(Dampak tertinggi — diimplementasikan)*
Identitas pemenang adalah data paling sensitif. Payout kini dikembalikan sebagai record credits privat — tidak ada yang bisa mengetahui siapa yang mengklaim kemenangan dari market yang sudah diselesaikan.

**Prioritas 2 — `sell_shares` → `transfer_public_to_private`** *(Dampak tinggi — diimplementasikan)*
Collateral kini dikembalikan sebagai record credits privat, menyembunyikan alamat penjual dan jumlah yang diterima.

**Prioritas 3 — `add_liquidity` → input credits privat** *(Dampak sedang — diimplementasikan)*
Kini menerima record `credits.aleo` privat dan memanggil `transfer_private_to_public` secara internal — identitas LP dan jumlah deposit sepenuhnya tersembunyi.

**Prioritas 4 — `claim_refund` → `transfer_public_to_private`** *(Dampak sedang — diimplementasikan)*
Klaim refund kini mengembalikan record credits privat, memutus hubungan antara penerimaan refund dan partisipasi awal.

**Prioritas 5 — `dispute_resolution` → bond credits privat** *(Dampak lebih rendah — diimplementasikan)*
Kini menerima record `credits.aleo` privat untuk bond melalui `transfer_private_to_public` — alamat disputer tidak lagi terekspos.

**Prioritas 6 — Privasi penuh USDCX** *(Butuh pembaruan stablecoin — Wave 6)*
Market USDCX tidak bisa sepenuhnya privat sampai `test_usdcx_stablecoin.aleo` mendukung `transfer_private_to_public`. Ini memerlukan upgrade terkoordinasi pada kontrak stablecoin.

---

## Milestone Wave 3

Wave 3 akan menghadirkan dukungan UI penuh untuk **market multi-outcome** dengan 3 dan 4 outcome di luar biner Yes/No, termasuk alur beli/jual yang diperbarui dan tampilan breakdown pool. **Halaman analitik market** akan menampilkan tren volume, statistik partisipasi, dan grafik per market. **Halaman profil pengguna** akan menampilkan riwayat betting, pelacakan PnL, dan statistik per alamat wallet. Frontend akan diperbarui untuk mendukung input record `credits.aleo` privat pada `add_liquidity` dan `dispute_resolution`. Kami juga akan menerbitkan **dokumentasi API** dan panduan self-hosting.

## Milestone Wave 4

Wave 4 akan berfokus pada kedalaman produk dan jangkauan developer. **Leaderboard** akan meranking peserta berdasarkan volume dan akurasi prediksi. **Komentar dan diskusi market** akan ditambahkan sebagai thread di halaman market. **Sistem notifikasi** akan memberi peringatan untuk resolusi, deadline, dan dispute. **Market stablecoin USDCX** akan sepenuhnya live dengan alur beli, jual, dan tukar yang lengkap. Terakhir, kami akan menerbitkan **TypeScript SDK `@veiled-markets/sdk`** untuk integrasi pihak ketiga.

## Milestone Wave 5–10 (Rencana Jangka Panjang)

- **Wave 5** — UI responsif mobile, LP provision UI dengan input credits privat, dashboard creator fee, otomatisasi indexer via cron
- **Wave 6** — Privasi USDCX penuh (butuh upgrade stablecoin), governance on-chain (tarif fee, whitelist resolver)
- **Wave 7** — Mekanisme voting DAO, UI manajemen protocol treasury
- **Wave 8** — Audit keamanan, optimasi biaya deploy, penyesuaian parameter fee untuk mainnet
- **Wave 9** — Deployment Mainnet, penguatan produksi, program bug bounty
- **Wave 10** — Peluncuran publik, integrasi ekosistem, pembuatan market terbuka untuk semua
