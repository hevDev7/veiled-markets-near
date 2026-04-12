#!/usr/bin/env tsx
// ============================================================================
// Turbo Bot — automated fixed-side betting scheduler
// ============================================================================
// Polls the backend oracle for current active turbo market and submits a
// buy_up_down transaction as soon as a new round opens.
//
// Usage:
//   tsx bot.ts <symbol> <side> <amountAleo>
//   tsx bot.ts BTC UP 1
//   DRY_RUN=1 tsx bot.ts BTC DOWN 0.5
//
// Requires: OPERATOR_PRIVATE_KEY env var (bettor's Aleo private key)
// ============================================================================

import {
  createTurboClient,
  createNodeExecutor,
  createIndexerClient,
  quoteBuyUpDown,
  TURBO_MIN_TRADE_AMOUNT,
  type TurboSide,
} from '@veiled-markets/sdk';

// ── Parse CLI args ──────────────────────────────────────────────────────────
const [symbolArg, sideArg, amountAleoArg] = process.argv.slice(2);
if (!symbolArg || !sideArg || !amountAleoArg) {
  console.error('Usage: tsx bot.ts <symbol> <UP|DOWN> <amountAleo>');
  console.error('Example: tsx bot.ts BTC UP 1');
  process.exit(1);
}

const symbol = symbolArg.toUpperCase();
const side = sideArg.toUpperCase() as TurboSide;
const amountAleo = parseFloat(amountAleoArg);
if (side !== 'UP' && side !== 'DOWN') {
  console.error(`Invalid side: ${sideArg}. Must be UP or DOWN.`);
  process.exit(1);
}
if (!Number.isFinite(amountAleo) || amountAleo <= 0) {
  console.error(`Invalid amount: ${amountAleoArg}`);
  process.exit(1);
}

const amountMicro = BigInt(Math.round(amountAleo * 1_000_000));
if (amountMicro < TURBO_MIN_TRADE_AMOUNT) {
  console.error(`Amount too small. Minimum: ${Number(TURBO_MIN_TRADE_AMOUNT) / 1_000_000} ALEO`);
  process.exit(1);
}

// ── Env ─────────────────────────────────────────────────────────────────────
const privateKey = process.env.OPERATOR_PRIVATE_KEY ?? process.env.ALEO_PRIVATE_KEY;
if (!privateKey) {
  console.error('OPERATOR_PRIVATE_KEY (or ALEO_PRIVATE_KEY) env var required');
  process.exit(1);
}

const oracleUrl = process.env.TURBO_ORACLE_URL ?? 'http://localhost:4090';
const dryRun = process.env.DRY_RUN === '1';

// ── Setup SDK ───────────────────────────────────────────────────────────────
const turbo = createTurboClient({ network: 'testnet' });
const executor = createNodeExecutor({
  privateKey,
  dryRun,
});

// Optional: connect indexer to show win rate stats
const indexer =
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ? createIndexerClient({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseKey: process.env.SUPABASE_ANON_KEY,
      })
    : null;

console.log(`[bot] ${symbol} ${side} ${amountAleo} ALEO per round${dryRun ? ' (DRY_RUN)' : ''}`);
if (indexer) {
  const total = await indexer.countTurboRounds(symbol);
  console.log(`[bot] indexer connected — ${total} historical rounds recorded`);
}

// ── Main loop ───────────────────────────────────────────────────────────────
let lastMarketId: string | null = null;

async function tick(): Promise<void> {
  try {
    // 1. Fetch current active market for the symbol from the operator
    //    backend (/chain/symbol endpoint)
    const res = await fetch(`${oracleUrl}/chain/symbol?symbol=${symbol}`);
    if (!res.ok) {
      console.warn(`[bot] oracle unreachable (${res.status})`);
      return;
    }
    const data = (await res.json()) as { market_id: string; status: string; deadline_ms?: number };
    if (data.status !== 'active') {
      return;  // wait for next round
    }
    if (data.market_id === lastMarketId) {
      return;  // already bet this round
    }

    // 2. New round detected — build and submit buy tx
    console.log(`\n[bot] new round: ${data.market_id.slice(0, 20)}…`);
    if (data.deadline_ms) {
      const secsLeft = Math.max(0, Math.floor((data.deadline_ms - Date.now()) / 1000));
      console.log(`[bot]   deadline in ${secsLeft}s`);
    }

    const quote = quoteBuyUpDown(amountMicro);
    console.log(
      `[bot]   quote: fee=${Number(quote.protocolFee) / 1_000_000} ALEO, ` +
      `expectedShares=${Number(quote.expectedShares) / 1_000_000}`,
    );

    // 3. Fetch a private credits record for the bet amount
    //    For a real bot, you'd call an Aleo RPC/snarkOS record fetch here.
    //    This example assumes the record plaintext is provided via env var
    //    or a local records file — adjust to your wallet setup.
    const creditsRecord = process.env.CREDITS_RECORD_PLAINTEXT ?? '<PASTE RECORD PLAINTEXT HERE>';
    if (creditsRecord.startsWith('<PASTE')) {
      console.warn(
        '[bot] CREDITS_RECORD_PLAINTEXT not set — skipping. Set this to the ' +
        'plaintext of a credits.aleo record covering the bet amount.',
      );
      lastMarketId = data.market_id;
      return;
    }

    // 4. Build and submit
    const call = turbo.buildBuyUpDownInputs({
      marketId: data.market_id,
      side,
      amountIn: quote.amountIn,
      expectedShares: quote.expectedShares,
      creditsRecord,
    });
    const result = await executor.execute(call);
    console.log(`[bot]   ✓ broadcast tx ${result.txId.slice(0, 20)}…`);
    lastMarketId = data.market_id;
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[bot] tick error: ${msg.slice(0, 200)}`);
  }
}

// Poll every 15 seconds — new rounds open every 5 min so this catches
// them within ~15s of creation. Faster polling increases RPC load.
await tick();
setInterval(tick, 15_000);
console.log('[bot] started — polling every 15s');
