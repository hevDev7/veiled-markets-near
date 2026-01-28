# Veiled Markets - Backend Indexer

## Overview

Backend service untuk index market IDs dari Aleo blockchain. Menggantikan hardcoded market IDs dengan dynamic loading.

## Quick Start

```bash
# Install dependencies
npm install

# Run indexer
npm run index

# Output: frontend/public/markets-index.json
```

## How It Works

1. **Scan Blockchain**: Fetch semua transactions dari `veiled_markets.aleo`
2. **Parse Transactions**: Extract `create_market` calls dan market IDs
3. **Generate JSON**: Save market registry ke `markets-index.json`
4. **Frontend Load**: Frontend auto-load market IDs saat startup

## Scripts

- `npm run index` - Run indexer sekali
- `npm run index:watch` - Run dengan auto-reload
- `npm run build` - Compile TypeScript

## Output Format

```json
{
  "lastUpdated": "2026-01-28T10:30:00.000Z",
  "totalMarkets": 8,
  "marketIds": ["...", "..."],
  "markets": [
    {
      "marketId": "...",
      "transactionId": "at1...",
      "questionHash": "10001field",
      "category": 1,
      "deadline": "14107191u64",
      "resolutionDeadline": "14124471u64",
      "createdAt": 1706437800000,
      "blockHeight": 14067123
    }
  ]
}
```

## Integration

Frontend automatically loads indexed data:

```typescript
// App.tsx
useEffect(() => {
  initializeMarketIds(); // Loads from /markets-index.json
}, []);
```

## Deployment

### Manual (Before Deploy)
```bash
./scripts/index-markets.sh
git add frontend/public/markets-index.json
git commit -m "Update market index"
git push
```

### Automated (Vercel Cron)
Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/index-markets",
    "schedule": "0 */6 * * *"
  }]
}
```

## Benefits vs Hardcoding

| Aspect | Hardcoded | Indexer |
|--------|-----------|---------|
| Scalability | ❌ Manual | ✅ Auto |
| Maintenance | ❌ High | ✅ Low |
| Real-time | ❌ No | ✅ Yes* |
| Deploy Frequency | ❌ Every market | ✅ Periodic |

*With cron job

## See Also

- [INDEXER_GUIDE.md](../INDEXER_GUIDE.md) - Detailed guide
- [frontend/src/lib/aleo-client.ts](../frontend/src/lib/aleo-client.ts) - Client integration
