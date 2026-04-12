#!/usr/bin/env tsx
// ============================================================================
// SDK smoke test — verifies @veiled-markets/sdk imports + basic API works
// ============================================================================
// Run BEFORE bot.ts to confirm SDK installation. No Telegram, no on-chain
// transactions, no environment variables required.
//
// Usage:
//   pnpm smoke
//   or: tsx smoke.ts
//
// Expected output: ✅ marks for each smoke check, then "ALL CHECKS PASSED"
// If any check fails, the SDK install or build is broken.
// ============================================================================

import {
  // Clients
  createClient,
  createTurboClient,
  createGovernanceClient,
  createParlayClient,
  createIndexerClient,
  createPythHermesClient,

  // Constants
  PROGRAM_IDS,
  PROTOCOL_FEE_BPS,
  CREATOR_FEE_BPS,
  LP_FEE_BPS,
  FEE_DENOMINATOR,
  TURBO_MIN_TRADE_AMOUNT,
  PYTH_FEED_IDS,

  // Enums
  TokenType,

  // Math functions
  calculateContractTradeFees,
  quoteContractBuy,
  calculateParlayQuote,

  // Utils
  formatCredits,
  shortenAddress,
  isValidAleoAddress,
} from '@veiled-markets/sdk'

const checks: { name: string; pass: boolean; detail?: string }[] = []
function check(name: string, pass: boolean, detail?: string) {
  checks.push({ name, pass, detail })
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log('━'.repeat(70))
console.log('@veiled-markets/sdk — smoke test')
console.log('━'.repeat(70))
console.log()

// ── 1. Constants exported correctly ──────────────────────────────────────────
check('PROGRAM_IDS exported', typeof PROGRAM_IDS === 'object')
check('PROGRAM_IDS.ALEO_MARKET correct', PROGRAM_IDS.ALEO_MARKET === 'veiled_markets_v37.aleo')
check('PROGRAM_IDS.TURBO correct', PROGRAM_IDS.TURBO === 'veiled_turbo_v8.aleo')
check('PROGRAM_IDS.GOVERNANCE correct', PROGRAM_IDS.GOVERNANCE === 'veiled_governance_v6.aleo')

check('PROTOCOL_FEE_BPS = 50 (0.5%)', Number(PROTOCOL_FEE_BPS) === 50)
check('CREATOR_FEE_BPS = 50 (0.5%)', Number(CREATOR_FEE_BPS) === 50)
check('LP_FEE_BPS = 100 (1%)', Number(LP_FEE_BPS) === 100)
check('FEE_DENOMINATOR = 10000', Number(FEE_DENOMINATOR) === 10000)

check('TURBO_MIN_TRADE_AMOUNT > 0', TURBO_MIN_TRADE_AMOUNT > 0n, `${Number(TURBO_MIN_TRADE_AMOUNT) / 1e6} ALEO`)
check('PYTH_FEED_IDS has BTC', typeof PYTH_FEED_IDS.BTC === 'string')
check('PYTH_FEED_IDS has ETH', typeof PYTH_FEED_IDS.ETH === 'string')
check('PYTH_FEED_IDS has SOL', typeof PYTH_FEED_IDS.SOL === 'string')

// ── 2. Client constructors don't throw ───────────────────────────────────────
try {
  const c = createClient({ network: 'testnet' })
  check('createClient() works', typeof c === 'object')
} catch (err) {
  check('createClient() works', false, (err as Error).message)
}

try {
  const t = createTurboClient({ network: 'testnet' })
  check('createTurboClient() works', typeof t === 'object')
} catch (err) {
  check('createTurboClient() works', false, (err as Error).message)
}

try {
  const g = createGovernanceClient({ network: 'testnet' })
  check('createGovernanceClient() works', typeof g === 'object')
} catch (err) {
  check('createGovernanceClient() works', false, (err as Error).message)
}

try {
  const p = createParlayClient({ network: 'testnet' })
  check('createParlayClient() works', typeof p === 'object')
} catch (err) {
  check('createParlayClient() works', false, (err as Error).message)
}

try {
  const ph = createPythHermesClient()
  check('createPythHermesClient() works', typeof ph === 'object')
} catch (err) {
  check('createPythHermesClient() works', false, (err as Error).message)
}

// indexer needs supabase URL - skip if not provided
try {
  const i = createIndexerClient({
    supabaseUrl: 'https://example.supabase.co',
    supabaseKey: 'fake-key-for-smoke-test',
  })
  check('createIndexerClient() works', typeof i === 'object')
} catch (err) {
  check('createIndexerClient() works', false, (err as Error).message)
}

// ── 3. Math functions return expected values ─────────────────────────────────
try {
  // calculateContractTradeFees(amountIn, feeConfig?)
  const fees = calculateContractTradeFees(1_000_000n, {
    protocolFeeBps: PROTOCOL_FEE_BPS,
    creatorFeeBps: CREATOR_FEE_BPS,
    lpFeeBps: LP_FEE_BPS,
  })
  // 1 ALEO = 1_000_000 micro
  // Protocol fee 0.5% = 5_000, Creator fee 0.5% = 5_000
  const correct = fees.protocolFee === 5_000n && fees.creatorFee === 5_000n
  check(
    'calculateContractTradeFees(1 ALEO) → 5_000 + 5_000 micro fees',
    correct,
    correct ? '' : `got protocol=${fees.protocolFee}, creator=${fees.creatorFee}`,
  )
} catch (err) {
  check('calculateContractTradeFees() works', false, (err as Error).message)
}

try {
  // quoteContractBuy(reserves: ContractMathReserves, outcome, amountIn, feeConfig?)
  const quote = quoteContractBuy(
    { reserve1: 10_000n, reserve2: 10_000n, numOutcomes: 2 },
    1,
    2_000n,
    { protocolFeeBps: PROTOCOL_FEE_BPS, creatorFeeBps: CREATOR_FEE_BPS, lpFeeBps: LP_FEE_BPS },
  )
  const hasShares = typeof quote.sharesOut === 'bigint' && quote.sharesOut > 0n
  check(
    'quoteContractBuy(binary FPMM) returns valid sharesOut',
    hasShares,
    hasShares ? `${quote.sharesOut} shares` : `sharesOut=${quote.sharesOut}`,
  )
} catch (err) {
  check('quoteContractBuy() works', false, (err as Error).message)
}

try {
  // calculateParlayQuote(legs, stake, tokenType, feeBps?)
  const quote = calculateParlayQuote(
    [
      { marketId: 'a', marketProgram: 1, outcome: 1, oddsBps: 5_000n },
      { marketId: 'b', marketProgram: 1, outcome: 1, oddsBps: 5_000n },
    ],
    1_000_000n,
    TokenType.ALEO,
  )
  // Combined odds: 5000 * 5000 / 10000 = 2500 bps (25% probability)
  const correctMultiplier = quote.combinedOddsBps === 2_500n
  check(
    'calculateParlayQuote(2 legs @ 50%) → combined 2500 bps',
    correctMultiplier,
    correctMultiplier ? `${quote.combinedOddsBps} bps` : `expected 2500, got ${quote.combinedOddsBps}`,
  )
} catch (err) {
  check('calculateParlayQuote() works', false, (err as Error).message)
}

// ── 4. Utility functions ─────────────────────────────────────────────────────
try {
  const formatted = formatCredits(1_500_000n)
  check('formatCredits(1.5 ALEO) returns string', typeof formatted === 'string', formatted)
} catch (err) {
  check('formatCredits() works', false, (err as Error).message)
}

try {
  const short = shortenAddress('aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8')
  check('shortenAddress() works', short.includes('…') || short.includes('...'), short)
} catch (err) {
  check('shortenAddress() works', false, (err as Error).message)
}

try {
  const valid = isValidAleoAddress('aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8')
  const invalid = isValidAleoAddress('not-an-address')
  check('isValidAleoAddress() validates correctly', valid === true && invalid === false)
} catch (err) {
  check('isValidAleoAddress() works', false, (err as Error).message)
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log()
console.log('━'.repeat(70))
const passed = checks.filter((c) => c.pass).length
const failed = checks.filter((c) => !c.pass).length
console.log(`Results: ${passed} passed, ${failed} failed (${checks.length} total)`)
console.log('━'.repeat(70))

if (failed === 0) {
  console.log()
  console.log('🎉 ALL CHECKS PASSED — SDK is working correctly!')
  console.log()
  console.log('Next steps:')
  console.log('  1. Copy .env.example to .env and fill in TELEGRAM_BOT_TOKEN')
  console.log('  2. Run: pnpm start')
  console.log('  3. Open your bot in Telegram and send /start')
  process.exit(0)
} else {
  console.log()
  console.log('❌ Some checks failed. Possible causes:')
  console.log('  - SDK not installed: run `pnpm install`')
  console.log('  - SDK version mismatch: check package.json `@veiled-markets/sdk` version')
  console.log('  - Network issue blocking npm install')
  process.exit(1)
}
