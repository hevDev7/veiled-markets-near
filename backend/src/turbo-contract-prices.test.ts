// Turbo rounds priced by the oracle contract the Veiled contract names (TURBO_PRICES=contract).
// Run: npx tsx --test src/turbo-contract-prices.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOCK_SLACK_MS,
  CloseWindowMissed,
  OPEN_PRICE_FRESH_SECS,
  PUSH_BACKOFF_MS,
  SETTLE_RETRY_MS,
  openRound,
  pythPush,
  settleRound,
  turboPriceMode,
  type ContractPriceDeps,
  type PythPush,
} from './turbo-contract-prices';

const VEILED = 'v1.veiled-markets.testnet';
const PYTH = 'pyth-oracle.testnet';
const KEEPER = 'veiled-oracle.testnet';
const FEED = 'f9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b';
const DEADLINE = 445_900_000n; // tick; starts at unix second DEADLINE * 4
const WINDOW_SECS = 20;
const deadlineMs = Number(DEADLINE) * 4000;
/** The round's close window in unix seconds: [OPENS, CLOSES]. */
const OPENS = Number(DEADLINE) * 4;
const CLOSES = OPENS + WINDOW_SECS;
/** The keeper's clock when it opens the round in these tests. */
const OPEN_NOW = deadlineMs - 80_000;

interface Options {
  settleErrors?: string[]; // one ERR_ code per failing settle attempt, in order; then settle succeeds
  roundStatus?: number;
  hermesStatus?: number;
  now?: number;
  /** publish_time of the price the oracle holds (null: none). Default: inside the close window. */
  stored?: number | null;
  /** false: update_price_feeds returns, but its later verification fails and nothing is stored. */
  pushStores?: boolean;
  paused?: boolean;
  /** The contract's oracle operator. Default: the keeper. */
  operator?: string;
  /** publish_time of the first update Hermes holds at or after a second. Default: that second. */
  hermesFirst?: (second: number) => number;
}

function harness(o: Options = {}) {
  const log: string[] = [];
  const settleErrors = [...(o.settleErrors ?? [])];
  let t = o.now ?? deadlineMs + 1000;
  let stored = o.stored === undefined ? OPENS + 1 : o.stored;
  let served = 0; // publish_time of the update Hermes sent last
  let pushStores = o.pushStores ?? true;
  const deps: ContractPriceDeps = {
    async view(contract, method, args) {
      log.push(`view ${contract} ${method} ${JSON.stringify(args)}`);
      if (contract === VEILED && method === 'get_turbo_oracle') {
        return { oracle: PYTH, close_window_secs: WINDOW_SECS, feeds: [{ symbol_id: 1, feed_id: FEED }] };
      }
      if (contract === VEILED && method === 'get_turbo_market') {
        return {
          id: String(args.market_id),
          symbol_id: 1,
          deadline: String(DEADLINE),
          status: o.roundStatus ?? 1,
          baseline_price: '60000123456',
          baseline_block: String(DEADLINE - 75n),
        };
      }
      if (contract === VEILED && method === 'get_governance') {
        return { owner: 'owner.testnet', pending_owner: null, oracle_operator: o.operator ?? KEEPER, committee: [], committee_quorum: 1 };
      }
      if (contract === VEILED && method === 'get_governance_values') return { paused: o.paused ?? false };
      if (contract === PYTH && method === 'get_price_unsafe') {
        return stored === null ? null : { price: '6000000000000', conf: '0', expo: -8, publish_time: stored };
      }
      if (contract === PYTH && method === 'get_update_fee_estimate') return '1234';
      throw new Error(`unexpected view ${contract} ${method}`);
    },
    async call(receiver, method, args, _gas, deposit) {
      log.push(`call ${receiver} ${method} ${JSON.stringify(args)} deposit=${deposit}`);
      if (method === 'open_turbo_round') return { txId: 'tx-open', value: '7' };
      if (method === 'update_price_feeds') {
        // Pyth keeps a price only when it is newer than the stored one.
        if (pushStores && (stored === null || served > stored)) stored = served;
        return { txId: 'tx-push', value: null };
      }
      if (method === 'settle_turbo_round') {
        const code = settleErrors.shift();
        if (code) throw new Error(`settle_turbo_round failed on chain: ${code} (tx tx-bad)`);
        return { txId: 'tx-settle', value: 2 };
      }
      throw new Error(`unexpected call ${method}`);
    },
    async get(url, headers) {
      log.push(`get ${url} auth=${headers.Authorization ?? '-'}`);
      const status = o.hermesStatus ?? 200;
      const second = url.match(/\/v2\/updates\/price\/(\d+)\?/);
      served = second ? (o.hermesFirst ?? ((s) => s))(Number(second[1])) : Math.floor(t / 1000);
      const price = { price: '6000000000000', conf: '0', expo: -8, publish_time: served };
      return {
        ok: status === 200,
        status,
        json: async () => ({ binary: { encoding: 'hex', data: ['abcd'] }, parsed: [{ id: FEED, price }] }),
      };
    },
    async sleep(ms) {
      log.push(`sleep ${ms}`);
      t += ms;
    },
    now: () => t,
  };
  return {
    deps,
    log,
    calls: () => log.filter((l) => l.startsWith('call ')),
    gets: () => log.filter((l) => l.startsWith('get ')),
    pushes: () => log.filter((l) => l.includes(' update_price_feeds ')).length,
    advance: (ms: number) => void (t += ms),
    setPushStores: (v: boolean) => void (pushStores = v),
  };
}

const method = (call: string) => call.split(' ')[2];
const hermes = () => pythPush('https://hermes-beta.pyth.network', 'k3y');
const opts = (push?: PythPush) => ({ veiled: VEILED, operator: KEEPER, push });
const latestUrl = `https://hermes-beta.pyth.network/v2/updates/price/latest?ids[]=${FEED}&encoding=hex&parsed=true auth=Bearer k3y`;
const deadlineUrl = `https://hermes-beta.pyth.network/v2/updates/price/${OPENS}?ids[]=${FEED}&encoding=hex&parsed=true auth=Bearer k3y`;

test('the contract mode is chosen only by TURBO_PRICES=contract', () => {
  assert.equal(turboPriceMode({}), 'operator');
  assert.equal(turboPriceMode({ TURBO_PRICES: 'operator' }), 'operator');
  assert.equal(turboPriceMode({ TURBO_PRICES: 'contract' }), 'contract');
  assert.equal(turboPriceMode({ TURBO_PRICES: 'Contract ' }), 'operator');
});

// ------------------------------------------------------------------------------------------ opening a round

test('without a push the round is opened with only the symbol and the deadline', async () => {
  const h = harness({ now: OPEN_NOW, stored: null });
  const r = await openRound(h.deps, opts(), 1, DEADLINE);
  assert.deepEqual(h.calls(), [`call ${VEILED} open_turbo_round {"symbol_id":1,"deadline":"${DEADLINE}"} deposit=0`]);
  assert.equal(r.marketId, '7');
  assert.equal(r.txId, 'tx-open');
  // The baseline is the contract's, read back from the new round.
  assert.equal(r.baselineMicro, 60_000_123_456n);
  assert.equal(r.baselineBlock, DEADLINE - 75n);
});

test('nothing is fetched or sent while the contract is paused', async () => {
  const h = harness({ now: OPEN_NOW, stored: null, paused: true });
  await assert.rejects(openRound(h.deps, opts(hermes()), 1, DEADLINE), /paused/);
  assert.equal(h.gets().length + h.calls().length, 0);
});

test('nothing is fetched or sent unless the keeper is the oracle operator', async () => {
  const h = harness({ now: OPEN_NOW, stored: null, operator: 'dao.sputnik-dao.testnet' });
  await assert.rejects(openRound(h.deps, opts(hermes()), 1, DEADLINE), /not the oracle operator/);
  assert.equal(h.gets().length + h.calls().length, 0);
});

test('a stored price at most ten seconds old opens the round without a push', async () => {
  const h = harness({ now: OPEN_NOW, stored: OPEN_NOW / 1000 - 10 });
  await openRound(h.deps, opts(hermes()), 1, DEADLINE);
  assert.equal(h.gets().length, 0);
  assert.deepEqual(h.calls().map(method), ['open_turbo_round']);
});

test('an older stored price is replaced with the latest update, read back, before the round opens', async () => {
  const h = harness({ now: OPEN_NOW, stored: OPEN_NOW / 1000 - 11 });
  await openRound(h.deps, opts(hermes()), 1, DEADLINE);
  assert.deepEqual(h.gets(), [`get ${latestUrl}`]);
  assert.deepEqual(h.calls(), [
    `call ${PYTH} update_price_feeds {"data":"abcd"} deposit=1234`,
    `call ${VEILED} open_turbo_round {"symbol_id":1,"deadline":"${DEADLINE}"} deposit=0`,
  ]);
  // The push is confirmed by reading the stored price after it.
  const pushAt = h.log.findIndex((l) => l.includes(' update_price_feeds '));
  assert.ok(h.log.slice(pushAt).some((l) => l === `view ${PYTH} get_price_unsafe {"price_identifier":"${FEED}"}`));
});

test('a push the oracle did not store fails the open, and the feed is not pushed again until a pause has passed', async () => {
  const h = harness({ now: OPEN_NOW, stored: null, pushStores: false });
  const push = hermes();
  await assert.rejects(openRound(h.deps, opts(push), 1, DEADLINE), /did not store/);
  assert.equal(h.pushes(), 1);
  assert.equal(h.calls().filter((c) => method(c) === 'open_turbo_round').length, 0);
  // Right away: refused without asking Hermes or sending anything.
  const gets = h.gets().length;
  await assert.rejects(openRound(h.deps, opts(push), 1, DEADLINE), /no push for this feed until/);
  assert.equal(h.gets().length, gets);
  assert.equal(h.pushes(), 1);
  // After the pause: one more push, which fails again and doubles the pause.
  h.advance(PUSH_BACKOFF_MS);
  await assert.rejects(openRound(h.deps, opts(push), 1, DEADLINE), /did not store/);
  assert.equal(h.pushes(), 2);
  h.advance(PUSH_BACKOFF_MS);
  await assert.rejects(openRound(h.deps, opts(push), 1, DEADLINE), /no push for this feed until/);
  assert.equal(h.pushes(), 2);
  // Once a push works the feed is no longer held back.
  h.advance(PUSH_BACKOFF_MS);
  h.setPushStores(true);
  await openRound(h.deps, opts(push), 1, DEADLINE);
  h.advance((OPEN_PRICE_FRESH_SECS + 1) * 1000); // the stored price is now too old to open on
  await openRound(h.deps, opts(push), 1, DEADLINE);
  assert.equal(h.pushes(), 4);
});

test('a push for a symbol the contract has no feed for fails before any request', async () => {
  const h = harness({ now: OPEN_NOW, stored: null });
  await assert.rejects(openRound(h.deps, opts(hermes()), 2, DEADLINE), /no oracle feed for symbol 2/);
  assert.equal(h.gets().length + h.calls().length, 0);
});

test('a refused Hermes request stops the push without a transaction', async () => {
  const h = harness({ now: OPEN_NOW, stored: null, hermesStatus: 401 });
  await assert.rejects(openRound(h.deps, opts(hermes()), 1, DEADLINE), /Hermes answered 401/);
  assert.equal(h.calls().length, 0);
});

// ------------------------------------------------------------------------------------------ settling a round

test('a stored price inside the close window settles the round without a push', async () => {
  const h = harness({ stored: OPENS + 3 });
  const r = await settleRound(h.deps, opts(hermes()), '7');
  assert.deepEqual(r, { txId: 'tx-settle', alreadySettled: false });
  assert.equal(h.gets().length, 0);
  assert.deepEqual(h.calls(), [`call ${VEILED} settle_turbo_round {"market_id":"7"} deposit=0`]);
});

test('an older stored price is replaced with the first update of the deadline second, then the round settles', async () => {
  const h = harness({ stored: OPENS - 30 });
  await settleRound(h.deps, opts(hermes()), '7');
  assert.deepEqual(h.gets(), [`get ${deadlineUrl}`]);
  assert.deepEqual(h.calls().map(method), ['update_price_feeds', 'settle_turbo_round']);
});

test('pushes that fail during a settle are retried after a pause, always for the deadline second, until the window closes', async () => {
  const h = harness({ stored: OPENS - 30, pushStores: false });
  await assert.rejects(settleRound(h.deps, opts(hermes()), '7'), (err) => err instanceof CloseWindowMissed);
  assert.ok(h.pushes() >= 1 && h.pushes() <= 2, `${h.pushes()} pushes`);
  assert.ok(h.gets().every((g) => g === `get ${deadlineUrl}`));
  assert.equal(h.calls().filter((c) => method(c) === 'settle_turbo_round').length, 0);
});

test('nothing is pushed when Hermes has no update inside the close window', async () => {
  const h = harness({ stored: OPENS - 30, hermesFirst: () => CLOSES + 1 });
  await assert.rejects(settleRound(h.deps, opts(hermes()), '7'), (err) => err instanceof CloseWindowMissed);
  assert.equal(h.calls().length, 0);
});

test('a stored price published after the close window ends the attempts without a request', async () => {
  const h = harness({ stored: CLOSES + 1 });
  await assert.rejects(settleRound(h.deps, opts(hermes()), '7'), (err) => err instanceof CloseWindowMissed);
  assert.equal(h.gets().length + h.calls().length, 0);
});

test('without a push, nothing is sent while the oracle holds no price inside the window', async () => {
  const h = harness({ stored: OPENS - 30 });
  await assert.rejects(settleRound(h.deps, opts(), '7'), (err) => err instanceof CloseWindowMissed);
  assert.equal(h.calls().length, 0);
});

test('a settle the contract finds too early is retried without pushing again', async () => {
  const h = harness({ settleErrors: ['ERR_NOT_ENDED', 'ERR_PRICE_TOO_EARLY'] });
  const r = await settleRound(h.deps, opts(hermes()), '7');
  assert.equal(r.txId, 'tx-settle');
  assert.deepEqual(h.calls().map(method), ['settle_turbo_round', 'settle_turbo_round', 'settle_turbo_round']);
  assert.equal(h.log.filter((l) => l === `sleep ${SETTLE_RETRY_MS}`).length, 2);
});

test('retries stop once the close window has passed', async () => {
  const h = harness({ settleErrors: Array(100).fill('ERR_PRICE_TOO_EARLY') });
  await assert.rejects(
    settleRound(h.deps, opts(), '7'),
    (err) => err instanceof CloseWindowMissed && /ERR_PRICE_TOO_EARLY/.test(err.message),
  );
  const last = deadlineMs + WINDOW_SECS * 1000 + CLOCK_SLACK_MS;
  const expected = Math.floor((last - (deadlineMs + 1000)) / SETTLE_RETRY_MS) + 1;
  assert.equal(h.calls().length, expected);
});

test('a price published after the window is not retried', async () => {
  const h = harness({ settleErrors: ['ERR_PRICE_TOO_LATE'] });
  await assert.rejects(
    settleRound(h.deps, opts(), '7'),
    (err) => err instanceof CloseWindowMissed && /ERR_PRICE_TOO_LATE/.test(err.message),
  );
  assert.equal(h.calls().length, 1);
});

test('a settle the contract refuses as past its window is a missed window', async () => {
  const h = harness({ settleErrors: ['ERR_RESOLUTION_WINDOW'] });
  await assert.rejects(
    settleRound(h.deps, opts(hermes()), '7'),
    (err) => err instanceof CloseWindowMissed && /ERR_RESOLUTION_WINDOW/.test(err.message),
  );
  assert.equal(h.calls().length, 1);
});

test('other settle failures are passed on for a later retry', async () => {
  const h = harness({ settleErrors: ['ERR_ORACLE_CALL'] });
  await assert.rejects(
    settleRound(h.deps, opts(), '7'),
    (err) => !(err instanceof CloseWindowMissed) && /ERR_ORACLE_CALL/.test((err as Error).message),
  );
  assert.equal(h.calls().length, 1);
});

test('a round someone else settled first counts as settled', async () => {
  const raced = harness({ settleErrors: ['ERR_STATUS'] });
  assert.deepEqual(await settleRound(raced.deps, opts(), '7'), { txId: '', alreadySettled: true });
  const done = harness({ roundStatus: 2 });
  assert.deepEqual(await settleRound(done.deps, opts(), '7'), { txId: '', alreadySettled: true });
  assert.equal(done.calls().length, 0);
});
