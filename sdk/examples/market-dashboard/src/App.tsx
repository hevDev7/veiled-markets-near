// ============================================================================
// Market Dashboard — minimal SDK consumer
// ============================================================================
// Single-file React app that uses the Veiled Markets SDK to fetch and
// display markets. Intentionally unstyled beyond inline CSS so the SDK
// calls are the focus.
// ============================================================================

import { useEffect, useState } from 'react';
import {
  createClient,
  createIndexerClient,
  createTurboClient,
  detectWallet,
  type MarketWithStats,
  type TurboMarket,
  type WalletAdapter,
} from '@veiled-markets/sdk';

// ── SDK instances — created once, reused across renders ────────────────────
const client = createClient({ network: 'testnet' });
const turbo = createTurboClient({ network: 'testnet' });

// Wire up indexer if env vars are present
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (supabaseUrl && supabaseKey) {
  client.setIndexer(createIndexerClient({ supabaseUrl, supabaseKey }));
}

export function App() {
  const [tab, setTab] = useState<'markets' | 'turbo'>('markets');
  const [wallet, setWallet] = useState<WalletAdapter | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  // Detect wallet on mount
  useEffect(() => {
    setWallet(detectWallet());
  }, []);

  async function connectWallet() {
    if (!wallet) {
      alert('No Aleo wallet detected. Install Shield, Puzzle, or Leo.');
      return;
    }
    try {
      const r = await wallet.connect();
      setAddress(r.address);
    } catch (err) {
      alert(`Connect failed: ${(err as Error).message}`);
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0 }}>Veiled Markets</h1>
          <p style={{ color: '#888', fontSize: 13, margin: '4px 0 0 0' }}>
            Minimal SDK example · testnet
          </p>
        </div>
        <button
          onClick={connectWallet}
          style={{
            padding: '10px 16px',
            background: address ? '#2d5a3a' : '#3a3a4a',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          {address
            ? `${wallet!.name}: ${address.slice(0, 8)}…${address.slice(-6)}`
            : wallet ? `Connect ${wallet.name}` : 'No wallet detected'}
        </button>
      </header>

      <nav style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid #333', paddingBottom: 8 }}>
        {(['markets', 'turbo'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px',
              background: tab === t ? '#3a6fd8' : 'transparent',
              color: tab === t ? 'white' : '#aaa',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: tab === t ? 600 : 400,
            }}
          >
            {t === 'markets' ? 'FAMM Markets' : 'Turbo'}
          </button>
        ))}
      </nav>

      {tab === 'markets' ? <MarketsTab /> : <TurboTab />}
    </div>
  );
}

// ── FAMM Markets Tab ───────────────────────────────────────────────────────
function MarketsTab() {
  const [markets, setMarkets] = useState<MarketWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const rows = await client.getTrendingMarkets(10);
        setMarkets(rows);
        if (rows.length === 0) {
          setError('No markets returned. Make sure SUPABASE_URL + SUPABASE_ANON_KEY are set in .env');
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p style={{ color: '#888' }}>Loading markets…</p>;
  if (error) return <p style={{ color: '#c44' }}>Error: {error}</p>;

  return (
    <div>
      <h2 style={{ fontSize: 16, color: '#aaa' }}>Top 10 markets by volume</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        {markets.map((m) => (
          <div
            key={m.id}
            style={{
              padding: 16,
              background: '#14141c',
              borderRadius: 10,
              border: '1px solid #222',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>
              {m.question ?? `Market ${m.id.slice(0, 12)}…`}
            </div>
            <div style={{ fontSize: 12, color: '#888', display: 'flex', gap: 16 }}>
              <span>Volume: {(Number(m.totalVolume) / 1_000_000).toFixed(2)}</span>
              <span>Liquidity: {(Number(m.totalLiquidity) / 1_000_000).toFixed(2)}</span>
              <span>Outcomes: {m.numOutcomes}</span>
            </div>
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>
              Prices: {m.prices.map((p) => (p * 100).toFixed(1) + '%').join(' · ')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Turbo Tab ──────────────────────────────────────────────────────────────
function TurboTab() {
  const [market, setMarket] = useState<TurboMarket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const oracleUrl = import.meta.env.VITE_TURBO_ORACLE_URL ?? 'http://localhost:4090';

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // Fetch current active market from operator backend
        const res = await fetch(`${oracleUrl}/chain/symbol?symbol=BTC`);
        if (!res.ok) throw new Error(`Operator backend unreachable (${res.status})`);
        const data = (await res.json()) as { market_id: string };
        // Then fetch the full on-chain market state via SDK
        const full = await turbo.getMarket(data.market_id);
        setMarket(full);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [oracleUrl]);

  if (loading) return <p style={{ color: '#888' }}>Loading turbo market…</p>;
  if (error) return <p style={{ color: '#c44' }}>Error: {error}</p>;
  if (!market) return <p style={{ color: '#888' }}>No active market</p>;

  return (
    <div>
      <h2 style={{ fontSize: 16, color: '#aaa' }}>Current BTC Turbo Market</h2>
      <div
        style={{
          padding: 20,
          background: '#14141c',
          borderRadius: 10,
          border: '1px solid #222',
        }}
      >
        <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Market ID</div>
        <div style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 16, wordBreak: 'break-all' }}>
          {market.id}
        </div>
        <div style={{ display: 'flex', gap: 32, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: '#888' }}>Baseline Price</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              ${(Number(market.baselinePrice) / 1_000_000).toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#888' }}>Deadline Block</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              {market.deadline.toString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#888' }}>Status</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              {market.status === 1 ? 'Active' : market.status === 2 ? 'Resolved' : 'Cancelled'}
            </div>
          </div>
        </div>
        <p style={{ fontSize: 11, color: '#666' }}>
          To place a bet, connect a wallet above and use <code>turbo.buildBuyUpDownInputs()</code>.
          See <code>src/App.tsx</code> for the pattern.
        </p>
      </div>
    </div>
  );
}
