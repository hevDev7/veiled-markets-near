#!/usr/bin/env tsx
// ============================================================================
// Governance Monitor — watch for disputes and committee decisions
// ============================================================================
// Polls the Veiled Governance contract + Supabase indexer for new disputes,
// committee decisions, and escalated markets. Prints to stdout and
// optionally posts alerts to a Discord webhook.
//
// Usage:
//   tsx monitor.ts              # daemon mode, poll every 60s
//   tsx monitor.ts --once       # one-shot, print current state and exit
//   DRY_RUN=1 tsx monitor.ts    # print Discord alerts to stdout instead
// ============================================================================

import {
  createGovernanceClient,
  createIndexerClient,
  type MarketDisputeState,
} from '@veiled-markets/sdk';

// ── Env ─────────────────────────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_ANON_KEY env vars required');
  process.exit(1);
}

const webhookUrl = process.env.DISCORD_WEBHOOK_URL ?? null;
const dryRun = process.env.DRY_RUN === '1';
const once = process.argv.includes('--once');
const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS ?? 60_000);

// ── Clients ─────────────────────────────────────────────────────────────────
const governance = createGovernanceClient({ network: 'testnet' });
const indexer = createIndexerClient({ supabaseUrl, supabaseKey });

// Track seen disputes so we only alert once per new event
const seenDisputes = new Set<string>();

async function main(): Promise<void> {
  console.log(`[monitor] starting${once ? ' (one-shot)' : ''}`);
  console.log(`[monitor] governance program: ${governance.programId}`);
  console.log(`[monitor] discord webhook: ${webhookUrl ? 'configured' : 'disabled'}${dryRun ? ' (dry-run)' : ''}`);

  await tick();
  if (once) return;
  setInterval(tick, pollIntervalMs);
  console.log(`[monitor] polling every ${pollIntervalMs / 1000}s`);
}

async function tick(): Promise<void> {
  // Fetch recently created markets from indexer. For each, check whether
  // there's a dispute on-chain.
  try {
    const markets = await indexer.listMarkets({ limit: 50 });

    for (const m of markets) {
      // The governance contract exposes getMarketDisputeState per market_id
      // across 3 token contracts. Try each in turn.
      const tokenTypes = [1 /* ALEO */, 2 /* USDCX */, 3 /* USAD */] as const;
      for (const t of tokenTypes) {
        const state = await governance.getMarketDisputeState(m.marketId, t);
        if (!state || state.disputer === '') continue;

        const key = `${m.marketId}-${state.disputedAt}`;
        if (seenDisputes.has(key)) continue;
        seenDisputes.add(key);

        console.log('\n─────────────────────────────────────');
        console.log(`[new dispute] ${m.questionText ?? m.marketId.slice(0, 20) + '…'}`);
        console.log(`  market_id: ${m.marketId}`);
        console.log(`  disputer: ${state.disputer}`);
        console.log(`  proposed outcome: ${state.proposedOutcome} (original: ${state.originalOutcome})`);
        console.log(`  bond: ${Number(state.disputeBond) / 1_000_000} tokens`);
        console.log(`  tier: ${tierName(state.escalatedTier)}`);
        console.log(`  final outcome: ${state.finalOutcome || 'pending'}`);

        if (webhookUrl) {
          await alertDiscord({
            question: m.questionText ?? `Market ${m.marketId.slice(0, 12)}…`,
            marketId: m.marketId,
            state,
          });
        }
      }
    }

    if (seenDisputes.size === 0) {
      console.log(`[monitor] ${new Date().toISOString()} — no disputes in recent ${markets.length} markets`);
    }
  } catch (err) {
    console.error(`[monitor] tick error: ${(err as Error).message}`);
  }
}

function tierName(tier: number): string {
  if (tier === 0) return 'none';
  if (tier === 1) return 'challenge';
  if (tier === 2) return 'committee';
  if (tier === 3) return 'community';
  return `unknown(${tier})`;
}

async function alertDiscord(event: {
  question: string;
  marketId: string;
  state: MarketDisputeState;
}): Promise<void> {
  const payload = {
    embeds: [
      {
        title: '⚠️ New dispute filed',
        description: event.question,
        color: 0xf59e0b,
        fields: [
          { name: 'Market ID', value: `\`${event.marketId.slice(0, 20)}…\``, inline: false },
          { name: 'Disputer', value: `\`${event.state.disputer.slice(0, 12)}…\``, inline: true },
          { name: 'Bond', value: `${Number(event.state.disputeBond) / 1_000_000} tokens`, inline: true },
          { name: 'Proposed Outcome', value: String(event.state.proposedOutcome), inline: true },
          { name: 'Tier', value: tierName(event.state.escalatedTier), inline: true },
        ],
        footer: { text: 'Veiled Markets Governance Monitor' },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  if (dryRun) {
    console.log('[discord-dryrun]', JSON.stringify(payload, null, 2));
    return;
  }

  try {
    const res = await fetch(webhookUrl!, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`[monitor] Discord webhook failed: ${res.status}`);
    }
  } catch (err) {
    console.warn(`[monitor] Discord post error: ${(err as Error).message}`);
  }
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
