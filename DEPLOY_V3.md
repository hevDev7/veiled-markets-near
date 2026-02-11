# 🚀 Deploy veiled_market_v3.aleo

## ✅ Status Build

**Build Berhasil!**
- Program: `veiled_market_v3.aleo`
- Checksum: `[203u8, 251u8, 165u8, 22u8, ...]`
- Status: ✅ Siap untuk deploy

## 📋 Program Versions

| Version | Program Name | Features |
|---------|--------------|----------|
| v1 | `veiled_markets_v2.aleo` | Basic betting |
| v2 | `veiled_markets_privacy.aleo` | Privacy enhancements |
| **v3** | **`veiled_market_v3.aleo`** | **Commit-Reveal Scheme** ✅ |

## 🚀 Quick Deploy

```bash
cd contracts
source .env
leo deploy --network testnet --broadcast --private-key "$PRIVATE_KEY"
```

**Atau gunakan script:**
```bash
cd contracts
./deploy-commit-reveal.sh
```

## 💰 Estimated Cost

- **Transaction Storage:** ~17 credits
- **Program Synthesis:** ~1 credit
- **Namespace:** 1 credit
- **Constructor:** ~0.002 credits
- **Total:** ~19-20 credits

**Balance saat ini:** 41.49 credits ✅ (cukup)

## ✅ After Deployment

### 1. Verify

```
https://testnet.explorer.provable.com/program/veiled_market_v3.aleo
```

### 2. Update References

Update semua referensi dari:
- `veiled_markets_privacy.aleo` → `veiled_market_v3.aleo`

**Files yang perlu di-update:**
- `frontend/src/lib/config.ts`
- `frontend/src/lib/aleo-client.ts`
- `backend/src/config.ts`
- `sdk/src/client.ts`

### 3. Test New Functions

```bash
# Test commit_bet
leo run commit_bet \
  "MARKET_ID_field" \
  "1000000u64" \
  "1u8" \
  "CREDITS_RECORD" \
  --network testnet

# Test reveal_bet (after deadline)
leo run reveal_bet \
  "BET_RECORD" \
  "COMMITMENT_RECORD" \
  "CREDITS_RECORD" \
  "1000000u64" \
  --network testnet
```

## 🎯 Features v3

✅ **Commit-Reveal Scheme**
- `commit_bet` - Private amount/outcome
- `reveal_bet` - Batch reveal after deadline
- Privacy score: **8/10**

✅ **Backward Compatible**
- `place_bet` - Legacy betting (still available)
- All existing functions work

---

**Siap untuk deploy!** 🚀
