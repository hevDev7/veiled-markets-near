# Puzzle Wallet SDK Issue

## Problem
Puzzle Wallet SDK (`@puzzlehq/sdk` v1.0.0) memiliki masalah dengan validasi inputs untuk `requestCreateEvent`.

### Error Message:
```json
{
  "code": "invalid_type",
  "expected": "string",
  "received": "undefined",
  "path": ["params", "inputs", 0-3],
  "message": "Required"
}
```

### Root Cause:
Error path menunjukkan `params.inputs[0]` yang berarti SDK mengharapkan struktur:
```typescript
{
  params: {
    type: 'Execute',
    programId: string,
    functionId: string,
    fee: number,
    inputs: string[]
  }
}
```

Tapi dokumentasi SDK dan type definitions menunjukkan format:
```typescript
{
  type: 'Execute',
  programId: string,
  functionId: string,
  fee: number,
  inputs: string[]
}
```

Ini adalah bug di Puzzle SDK atau dokumentasi yang tidak lengkap.

## Workaround: Use Leo Wallet Instead

Leo Wallet menggunakan `@provablehq/aleo-wallet-adaptor-leo` yang lebih stabil dan well-documented.

### Steps:

1. **Install Leo Wallet Extension**
   - Download: https://leo.app
   - Install di browser
   - Create/Import account
   - Switch to Testnet Beta

2. **Connect dengan Leo Wallet**
   - Di dashboard, klik "Connect Wallet"
   - Pilih "Leo Wallet" (🦁)
   - Approve connection
   - Pilih network: Testnet Beta

3. **Create Market**
   - Klik "Create Market"
   - Isi form
   - Approve transaction di Leo Wallet
   - Success! ✅

## Alternative: Fix Puzzle SDK Integration

Jika tetap ingin menggunakan Puzzle Wallet, perlu:

1. **Check SDK Documentation**
   - Baca docs di https://docs.puzzle.online
   - Cari contoh penggunaan `requestCreateEvent`
   - Lihat format yang benar untuk Execute event

2. **Update SDK Version**
   ```bash
   cd frontend
   npm update @puzzlehq/sdk
   ```

3. **Try Different Format**
   Coba wrap params:
   ```typescript
   await requestCreateEvent({
     params: {
       type: 'Execute',
       programId: 'veiled_markets.aleo',
       functionId: 'create_market',
       fee: 1000000,
       inputs: ['...', '...', '...', '...']
     }
   });
   ```

4. **Contact Puzzle Support**
   - Report bug di GitHub: https://github.com/puzzlehq/sdk
   - Join Discord: https://discord.gg/puzzle
   - Ask for help with Execute event format

## Recommended Solution

**Use Leo Wallet for now** karena:
- ✅ Well-documented API
- ✅ Stable and tested
- ✅ Official Aleo wallet
- ✅ Better error messages
- ✅ Works with testnet beta

Puzzle Wallet bisa digunakan nanti setelah SDK issue resolved.

## Testing with Leo Wallet

```bash
# 1. Refresh frontend
cd frontend
npm run dev

# 2. Open browser
http://localhost:3000

# 3. Connect Leo Wallet
- Click "Connect Wallet"
- Choose "Leo Wallet"
- Approve

# 4. Create Market
- Click "Create Market"
- Fill form
- Submit
- Approve in Leo Wallet
- Success!
```

## Status

- ❌ Puzzle Wallet: SDK validation issue
- ✅ Leo Wallet: Working
- ✅ Demo Mode: Working (for UI testing)

## Next Steps

1. Use Leo Wallet for production
2. Report Puzzle SDK issue to maintainers
3. Update when SDK is fixed
4. Add Puzzle Wallet back when working
