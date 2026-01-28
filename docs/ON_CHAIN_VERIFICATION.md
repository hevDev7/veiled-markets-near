# On-Chain Verification Feature

## Overview

Setiap market card dan row sekarang menampilkan link "Verify On-Chain" yang mengarah ke transaction creation di Aleo blockchain explorer. Ini membuktikan bahwa market benar-benar di-host on-chain dan bukan mock data.

## Implementation

### 1. Transaction ID Mapping

File: `frontend/src/lib/aleo-client.ts`

```typescript
const MARKET_TX_MAP: Record<string, string> = {
  'market_id': 'transaction_id',
  // ...
};

export function getMarketTransactionId(marketId: string): string | null {
  return MARKET_TX_MAP[marketId] || null;
}
```

### 2. Market Type Extension

File: `frontend/src/lib/store.ts`

```typescript
export interface Market {
  // ... existing fields
  transactionId?: string; // Creation transaction ID for verification
}
```

### 3. UI Components

#### MarketCard (Grid View)
- Link ditampilkan di bawah payout buttons
- Full width button dengan icon Shield dan ExternalLink
- Warna brand (purple) untuk konsistensi

#### MarketRow (List View)
- Desktop: Compact button di sebelah payout multipliers
- Mobile: Full width button di bawah stats
- Sama-sama menggunakan brand colors

### 4. Link Format

```
https://testnet.explorer.provable.com/transaction/{transactionId}
```

Contoh:
```
https://testnet.explorer.provable.com/transaction/at1eqvc2jzfnmuc7c9fzuny0uu34tqfjd2mv4xpqnknd9hnvz8l2qrsd8yyez
```

## User Experience

### Desktop
1. User melihat market card/row
2. Klik "Verify On-Chain" button
3. Opens blockchain explorer di tab baru
4. User dapat verify:
   - Transaction hash
   - Block height
   - Timestamp
   - Program ID (veiled_markets.aleo)
   - Function (create_market)
   - Inputs (question_hash, category, deadlines)

### Mobile
1. Verification link ditampilkan di bagian bawah card
2. Full width untuk easy tapping
3. Same verification flow

## Benefits

### Trust & Transparency
✅ Users dapat verify market authenticity
✅ Proof bahwa data berasal dari blockchain
✅ No hidden mock data

### Decentralization
✅ Anyone dapat verify independently
✅ No need to trust frontend
✅ Blockchain as source of truth

### Developer Experience
✅ Easy debugging (check transaction details)
✅ Audit trail untuk setiap market
✅ Transparent deployment history

## Current Markets with Verification

| Category | Question | Transaction ID |
|----------|----------|----------------|
| Politics | Will Trump complete his full presidential term through 2028? | [at1j8xal...](https://testnet.explorer.provable.com/transaction/at1j8xalgyfw7thg2zmpy9zlt82cpegse3vqsm9g3z2l3a59wj3ry8qg9n9u7) |
| Sports | Will Lionel Messi win the 2026 FIFA World Cup with Argentina? | [at1q5rvk...](https://testnet.explorer.provable.com/transaction/at1q5rvkyexgwnvrwlw587s7qzl2tegn6524we96gyhuc0hz7zs55rqfm00r4) |
| Crypto | Will Bitcoin reach $150,000 by end of Q1 2026? | [at1fvk3t...](https://testnet.explorer.provable.com/transaction/at1fvk3t9494tp56a7gykna7djgnurf25yphxg9ystprcjxhach0qxsn8e5wx) |
| Entertainment | Will Avatar 3 gross over $2 billion worldwide in 2026? | [at1fnyzg...](https://testnet.explorer.provable.com/transaction/at1fnyzg2j7n4ep2l6p0qvlfnfqsufh7jxerfpe7chzymgsl0ukeyqqhrceej) |
| Tech | Will Apple release AR glasses (Apple Vision Pro 2) in 2026? | [at12f9uv...](https://testnet.explorer.provable.com/transaction/at12f9uvhadvppk3kqqe8y6s4mwsnn37fnv2lkzd3s8pdvy9yz8h5zqyzwrwa) |
| Economics | Will global inflation drop below 3% average by end of 2026? | [at14agvn...](https://testnet.explorer.provable.com/transaction/at14agvnhed7rfh9pvxfmm64kw50jt4aea0y40r0u2vc46znsvk3vgsdxglv4) |
| Science | Will NASA Artemis III successfully land humans on Moon in 2026? | [at1eqvc2...](https://testnet.explorer.provable.com/transaction/at1eqvc2jzfnmuc7c9fzuny0uu34tqfjd2mv4xpqnknd9hnvz8l2qrsd8yyez) |

## Future Enhancements

### 1. Auto-fetch Transaction IDs
Instead of hardcoding, fetch from indexer:

```typescript
// backend/src/indexer.ts
interface IndexedMarket {
  marketId: string;
  transactionId: string; // ✅ Already included
  // ...
}
```

### 2. Show Transaction Details in Modal
Display transaction info without leaving app:

```typescript
<TransactionModal
  txId={market.transactionId}
  onClose={() => setShowTxModal(false)}
/>
```

### 3. QR Code for Mobile Sharing
Generate QR code untuk easy sharing:

```typescript
<QRCode value={explorerUrl} />
```

### 4. Transaction Status Badge
Show confirmation status:

```typescript
{txConfirmed ? (
  <Badge color="green">Confirmed</Badge>
) : (
  <Badge color="yellow">Pending</Badge>
)}
```

## Testing

### Manual Test
1. Open dashboard
2. Find any market card
3. Click "Verify On-Chain" button
4. Verify explorer opens with correct transaction
5. Check transaction details match market data

### Automated Test
```typescript
describe('On-chain Verification', () => {
  it('should display verification link for markets with txId', () => {
    const market = { ...mockMarket, transactionId: 'at1...' };
    render(<MarketCard market={market} />);
    expect(screen.getByText(/verify on-chain/i)).toBeInTheDocument();
  });

  it('should not display link for markets without txId', () => {
    const market = { ...mockMarket, transactionId: undefined };
    render(<MarketCard market={market} />);
    expect(screen.queryByText(/verify on-chain/i)).not.toBeInTheDocument();
  });
});
```

## Maintenance

### Adding New Markets
When creating new market via CLI:

1. Note the transaction ID from output
2. Add to `MARKET_TX_MAP` in `aleo-client.ts`:

```typescript
const MARKET_TX_MAP: Record<string, string> = {
  // ... existing
  'NEW_MARKET_ID': 'NEW_TRANSACTION_ID',
};
```

3. Or run indexer to auto-populate:

```bash
./scripts/index-markets.sh
```

### Updating Explorer URL
If explorer URL changes, update in `frontend/.env`:

```env
VITE_EXPLORER_URL=https://new-explorer-url.com/testnet
```

## Security Considerations

### Link Safety
- ✅ Uses `rel="noopener noreferrer"` to prevent tab hijacking
- ✅ Opens in new tab (`target="_blank"`)
- ✅ Stops event propagation to prevent card click

### Data Validation
- ✅ Only shows link if `transactionId` exists
- ✅ Transaction ID format validated by blockchain
- ✅ Explorer URL from config (not user input)

## Conclusion

On-chain verification feature meningkatkan trust dan transparency dengan memberikan users cara mudah untuk verify bahwa markets benar-benar di-host on-chain. Ini adalah fitur penting untuk decentralized application yang menekankan trustlessness dan verifiability.
