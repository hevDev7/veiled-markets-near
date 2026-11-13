// The "will <coin> trade above $<price> at <time>" market that quick-market.ts opens, with a resolution source the
// AI resolver can read: CoinGecko's price series around the moment, whose samples fall on five-minute marks.
import type { MarketText } from './market-meta';

const STEP_MS = 5 * 60_000;

/** The first five-minute mark at least `minutes` after `nowMs`: CoinGecko's price series has a sample exactly there. */
export function questionMoment(nowMs: number, minutes: number): Date {
  return new Date(Math.ceil((nowMs + minutes * 60_000) / STEP_MS) * STEP_MS);
}

/**
 * CoinGecko's keyless price series for a coin from five minutes before `at` to five minutes after, as
 * [time in ms, USD price] pairs. Within a day of `at` it has a sample every five minutes, one of them at `at`.
 */
export function priceSeriesUrl(coinId: string, at: Date): string {
  const t = Math.floor(at.getTime() / 1000);
  return `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${t - 300}&to=${t + 300}`;
}

/** The market's question, its rules (which name the sample that decides it), its source and its outcomes. */
export function priceQuestion(coin: { name: string; symbol: string }, coinId: string, threshold: string, at: Date): MarketText {
  const hhmm = at.toISOString().slice(11, 16);
  const day = at.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  // "NEAR" for NEAR Protocol, "Bittensor (TAO)" when the name does not carry the ticker.
  const label = coin.name.toUpperCase().startsWith(coin.symbol) ? coin.symbol : `${coin.name} (${coin.symbol})`;
  return {
    question: `Will ${label} trade above $${threshold} at ${hhmm} UTC on ${day}?`,
    description:
      `Resolves YES if CoinGecko's ${coin.symbol}/USD price at ${hhmm} UTC on ${day} is above $${threshold}, and NO otherwise. ` +
      `The resolution source is CoinGecko's price series around that moment, as [time in ms, USD price] pairs: ` +
      `the pair at ${at.getTime()} (${hhmm} UTC) decides. A short demo market on NEAR testnet.`,
    resolutionSource: priceSeriesUrl(coinId, at),
    outcomes: ['Yes', 'No'],
  };
}
