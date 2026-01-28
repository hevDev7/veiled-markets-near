# Deploy Veiled Markets Contract

## Prerequisites
- Private Key: `APrivateKey1zkp2hcw63PzWVN385KsjeRkKFs76TeogaMrXfsAViFRVAgE`
- Address: `aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8`
- Program Name: `veiled_markets.aleo`
- Balance: Minimum 14 Aleo credits (deployment cost: ~13.18 credits)

## Method 1: Deploy via Leo CLI (Recommended)

### Step 1: Verify Balance
```bash
# Check your balance (should have 14+ credits)
curl "https://api.explorer.provable.com/v1/testnet/latest/height"
```

### Step 2: Deploy with Broadcast
```bash
cd contracts
leo deploy --network testnet --broadcast
```

**IMPORTANT**: The `--broadcast` flag is REQUIRED to actually send the transaction to the network!

### Alternative with explicit endpoint:
```bash
leo deploy --network testnet --endpoint https://api.explorer.provable.com/v1 --broadcast
```

### What happens:
1. Leo compiles your contract
2. Creates deployment transaction (cost: 13.178882 credits)
3. **Broadcasts transaction to testnet** (because of --broadcast flag)
4. Returns transaction ID

### Step 3: Verify Deployment
After deployment completes, check:
```bash
# Method 1: Via API
curl "https://api.explorer.provable.com/v1/testnet/program/veiled_markets.aleo"

# Method 2: Via Explorer
# Visit: https://testnet.aleoscan.io/program/veiled_markets.aleo
```

---

## Method 2: Deploy via Leo Playground (Alternative)

### 1. Open Leo Playground
Go to: https://play.leo-lang.org/

### 2. Import Your Private Key
- Click on the wallet icon (top right)
- Select "Import Private Key"
- Paste: `APrivateKey1zkp2hcw63PzWVN385KsjeRkKFs76TeogaMrXfsAViFRVAgE`
- Confirm import

### 3. Copy Contract Code
Open `contracts/build/main.aleo` and copy ALL 297 lines of code.

### 4. Paste into Playground
- Clear the default code in the playground editor
- Paste the entire contract code from `main.aleo`

### 5. Deploy
- Click the "Deploy" button (top right)
- Wait for deployment confirmation (this may take several minutes)
- You'll receive a transaction ID

### 6. Verify Deployment
Visit: https://testnet.aleoscan.io/program/veiled_markets.aleo

You should see your deployed program with all functions:
- create_market
- place_bet
- close_market
- resolve_market
- claim_winnings
- withdraw_winnings
- cancel_market
- emergency_cancel
- claim_refund

---

## After Successful Deployment

### Update Frontend Configuration
Update `frontend/.env` with:
```
VITE_PROGRAM_ID=veiled_markets.aleo
VITE_NETWORK=testnet
VITE_API_URL=https://testnet3.aleoscan.io
```

### Test Contract Functions
You can test functions directly in the playground or via the frontend.

## Troubleshooting

### If deployment fails:
1. Check your account has enough credits for deployment fees
2. Verify the private key is correct
3. Try again - network congestion can cause timeouts

### If program name already exists:
The program name `veiled_markets.aleo` might already be taken. In that case:
1. Edit `contracts/program.json` and change the program name
2. Rebuild: `leo build`
3. Deploy with the new name

## Program Details
- **Size**: 8.62 KB / 97.66 KB
- **Statements**: 254
- **Functions**: 9 transitions
- **Mappings**: 5 on-chain storage mappings
