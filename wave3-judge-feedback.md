# Wave 3 Judge Feedback - Analisis & Rencana Aksi

## Feedback Asli

> "Consider adding more market types beyond binary. Explore governance token for multisig. The FPMM implementation with dual-token support is the most production-ready prediction market in the wave. UI is a little bland and generic."

---

## 1. "Consider adding more market types beyond binary"

### Apa yang dimaksud juri?

Saat ini Veiled Markets hanya mendukung **binary market** (Yes/No — 2 outcome). Juri ingin melihat variasi tipe market yang lebih kaya.

### Tipe market yang bisa ditambahkan

| Tipe | Deskripsi | Contoh |
|------|-----------|--------|
| **Categorical / Multi-outcome** | Market dengan 3+ pilihan jawaban | "Siapa yang menang pemilu?" → Kandidat A / B / C / D |
| **Scalar / Range** | Market dengan outcome berupa angka dalam rentang tertentu | "Berapa harga BTC di akhir 2026?" → $50k-$100k-$150k-$200k+ |
| **Combinatorial** | Market yang menggabungkan beberapa kondisi | "Apakah ETH > $5k DAN BTC > $150k di Q4 2026?" |
| **Conditional** | Market yang hanya aktif jika kondisi lain terpenuhi | "Jika Trump menang, apakah crypto regulation akan dilonggarkan?" |

### Prioritas rekomendasi

1. **Categorical (3-4 outcome)** — Paling realistis karena FPMM kita sudah support multi-outcome secara matematis (step division untuk 3-4 outcome sudah ada di contract). Tinggal buka di frontend + pastikan contract handle >2 outcome dengan benar.
2. **Scalar** — Bisa diimplementasi sebagai categorical dengan bucket/range yang di-discretize (misal: "<$100k", "$100k-$150k", "$150k-$200k", ">$200k").

### Dampak teknis

- Contract: FPMM formula sudah mendukung hingga 4 outcome. Perlu validasi bahwa `buy_shares` dan `sell_shares` bekerja benar untuk 3-4 outcome.
- Frontend: Perlu UI baru untuk memilih outcome (bukan hanya Yes/No toggle), form create market dengan dynamic outcome inputs.
- Resolusi: `resolve_market` perlu parameter outcome index (bukan hanya boolean).

---

## 2. "Explore governance token for multisig"

### Apa yang dimaksud juri?

Juri ingin kita mengeksplorasi **governance token** — token yang memberikan hak suara kepada holder untuk keputusan protokol, terutama terkait **multisig** (multi-signature) operations.

### Konsep yang diharapkan

#### A. Governance Token
- Token khusus (misalnya `VEIL`) yang didistribusikan ke:
  - LP providers (sebagai reward)
  - Active traders (incentive)
  - Early adopters
- Holder token bisa voting untuk:
  - Penambahan market category baru
  - Perubahan fee structure (protocol/creator/LP split)
  - Penentuan resolver untuk disputed markets
  - Treasury allocation
  - Parameter upgrade (deadline, minimum liquidity, dll)

#### B. Multisig Governance
- Saat ini `admin` / `resolver` adalah single address — single point of failure
- Juri ingin melihat **multisig** di mana keputusan penting memerlukan persetujuan dari beberapa pihak:
  - **Market resolution**: 3-of-5 resolver committee voting (bukan 1 resolver)
  - **Treasury withdrawal**: Memerlukan M-of-N signature
  - **Emergency actions**: Cancel market, pause protocol — butuh quorum
  - **Protocol upgrades**: Parameter changes butuh governance vote

#### C. Implementasi di Aleo

| Pendekatan | Deskripsi | Kompleksitas |
|------------|-----------|-------------|
| **On-chain voting** | Governance token holder submit vote, tally di finalize | Tinggi — butuh new program |
| **Multisig resolver** | Market punya N resolver addresses, butuh M votes untuk resolve | Sedang — extend existing contract |
| **Timelock + veto** | Resolver propose, governance token holder bisa veto dalam timeframe | Sedang |
| **Snapshot voting** | Off-chain voting berdasarkan token balance snapshot, execute on-chain | Rendah on-chain, butuh off-chain infra |

### Prioritas rekomendasi

1. **Multisig resolver** — Paling langsung relevan. Ganti single `resolver: address` dengan threshold voting mechanism.
2. **Simple governance token** — Mint `VEIL` token, distribusi ke LP/traders, gunakan untuk voting resolusi market yang di-dispute.
3. **Treasury governance** — Protocol fee treasury dikelola oleh governance vote.

---

## 3. "FPMM implementation with dual-token support is the most production-ready"

### Ini adalah pujian

Juri mengakui bahwa implementasi FPMM (Fixed Product Market Maker) kita dengan dukungan ALEO + USDCX adalah yang **paling production-ready** di seluruh wave. Ini berarti:

- Arsitektur smart contract kita solid
- Dual-token support (ALEO native + stablecoin) adalah differentiator
- FPMM model lebih baik dari parimutuel sederhana

### Yang perlu dipertahankan & diperkuat

- Dokumentasi FPMM formula dan invariant
- Test coverage untuk edge cases (extreme price, low liquidity)
- Security audit trail (v9 audit → v10 fixes → v18 security → v22)

---

## 4. "UI is a little bland and generic"

### Apa yang dimaksud juri?

UI saat ini terlihat standar/template — kurang memiliki identitas visual dan polish yang membedakan dari generic DeFi dashboard.

### Area yang perlu diperbaiki

#### A. Visual Identity & Branding
- **Color palette**: Buat palette yang distinctive (bukan hanya default Tailwind colors)
- **Typography**: Gunakan font pairing yang memorable (heading + body)
- **Logo & iconography**: Custom icons untuk market categories, outcome badges
- **Dark/light mode**: Polish kedua mode dengan intentional color choices

#### B. Data Visualization
- **Price charts**: Grafik harga real-time untuk setiap market (line chart outcome probability over time)
- **Market depth**: Visualisasi liquidity depth
- **Portfolio view**: Dashboard personal showing positions, P&L, history
- **Market cards**: Design yang lebih informatif — show probability, volume, time remaining secara visual (progress bar, donut chart)

#### C. Interaction & UX Polish
- **Animations**: Smooth transitions saat bet, market creation, resolution
- **Loading states**: Skeleton loaders bukan spinner generic
- **Toast notifications**: Custom styled notifications untuk TX status
- **Responsive design**: Mobile-first optimization
- **Onboarding flow**: Guided tour untuk first-time users

#### D. Market Discovery
- **Featured markets**: Hero section dengan highlighted markets
- **Categories with icons**: Visual category browsing (Sports, Crypto, Politics, etc.)
- **Trending/Hot**: Sorting by volume, recent activity
- **Search & filter**: Real-time search, multi-filter (category, token, status, deadline)

#### E. Inspirasi UI dari prediction markets yang ada
- **Polymarket**: Clean, data-dense, chart-forward
- **Manifold**: Colorful, gamified, social features
- **Kalshi**: Professional, financial-grade UI
- **Augur**: Crypto-native, dark theme

### Prioritas rekomendasi

1. **Color palette + typography overhaul** — Dampak visual terbesar dengan effort minimal
2. **Market cards redesign** — Tampilkan probability bars, volume badges, countdown timer
3. **Price/probability chart** — Setiap market punya chart sederhana showing odds over time
4. **Animations & micro-interactions** — Loading states, transitions, hover effects

---

## Ringkasan Prioritas untuk Wave 4

| # | Item | Impact | Effort | Prioritas |
|---|------|--------|--------|-----------|
| 1 | UI overhaul (colors, typography, cards) | Tinggi | Sedang | **P0** |
| 2 | Categorical markets (3-4 outcome) | Tinggi | Sedang | **P0** |
| 3 | Multisig resolver | Tinggi | Tinggi | **P1** |
| 4 | Price/probability charts | Sedang | Sedang | **P1** |
| 5 | Governance token (basic) | Sedang | Tinggi | **P2** |
| 6 | Market discovery (search, filter, featured) | Sedang | Rendah | **P1** |
| 7 | Animations & polish | Rendah | Rendah | **P2** |
| 8 | Scalar markets | Rendah | Tinggi | **P3** |
