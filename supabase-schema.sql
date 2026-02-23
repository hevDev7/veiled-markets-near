-- ============================================================================
-- VEILED MARKETS — Supabase Schema
-- ============================================================================
-- Run this SQL in your Supabase SQL Editor to create the required tables.
-- Tables: user_bets, pending_bets, commitment_records, market_registry
-- ============================================================================

-- 1. User Bets (confirmed on-chain bets)
CREATE TABLE IF NOT EXISTS user_bets (
  id TEXT NOT NULL,
  address TEXT NOT NULL,
  market_id TEXT NOT NULL,
  amount TEXT,
  outcome TEXT,
  locked_multiplier TEXT,
  shares_received TEXT,
  shares_sold TEXT,
  tokens_received TEXT,
  payout_amount TEXT,
  winning_outcome TEXT,
  placed_at BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  type TEXT NOT NULL DEFAULT 'buy',
  market_question TEXT,
  claimed BOOLEAN NOT NULL DEFAULT FALSE,
  token_type TEXT DEFAULT 'ALEO',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, address)
);

-- 2. Pending Bets (awaiting on-chain confirmation)
CREATE TABLE IF NOT EXISTS pending_bets (
  id TEXT NOT NULL,
  address TEXT NOT NULL,
  market_id TEXT NOT NULL,
  amount TEXT,
  outcome TEXT,
  locked_multiplier TEXT,
  shares_received TEXT,
  shares_sold TEXT,
  tokens_received TEXT,
  payout_amount TEXT,
  winning_outcome TEXT,
  placed_at BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  type TEXT NOT NULL DEFAULT 'buy',
  market_question TEXT,
  claimed BOOLEAN NOT NULL DEFAULT FALSE,
  token_type TEXT DEFAULT 'ALEO',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, address)
);

-- 3. Commitment Records (commit-reveal scheme)
CREATE TABLE IF NOT EXISTS commitment_records (
  id TEXT NOT NULL,
  address TEXT NOT NULL,
  market_id TEXT NOT NULL,
  amount TEXT,
  outcome TEXT,
  commitment_hash TEXT,
  user_nonce TEXT,
  bettor TEXT,
  bet_amount_record_plaintext TEXT,
  commit_tx_id TEXT,
  committed_at BIGINT,
  revealed BOOLEAN NOT NULL DEFAULT FALSE,
  reveal_tx_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, address)
);

-- 4. Market Registry (public, unencrypted)
CREATE TABLE IF NOT EXISTS market_registry (
  market_id TEXT PRIMARY KEY,
  question_hash TEXT,
  question_text TEXT,
  description TEXT,
  resolution_source TEXT,
  category INTEGER,
  creator_address TEXT,
  transaction_id TEXT,
  created_at BIGINT,
  ipfs_cid TEXT,
  outcome_labels TEXT
);

-- Migration for existing tables (run if table already exists)
-- ALTER TABLE market_registry ADD COLUMN IF NOT EXISTS ipfs_cid TEXT;
-- ALTER TABLE market_registry ADD COLUMN IF NOT EXISTS outcome_labels TEXT;

-- IMPORTANT: Drop the outcome check constraint if it exists.
-- The outcome field stores ENCRYPTED values (AES-256-GCM ciphertext),
-- so any CHECK constraint on plain-text values will fail.
-- Run this in Supabase SQL Editor:
-- ALTER TABLE user_bets DROP CONSTRAINT IF EXISTS user_bets_outcome_check;
-- ALTER TABLE pending_bets DROP CONSTRAINT IF EXISTS pending_bets_outcome_check;

-- ============================================================================
-- Row Level Security (RLS) — Optional but recommended
-- ============================================================================

-- Enable RLS on bet tables
ALTER TABLE user_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE commitment_records ENABLE ROW LEVEL SECURITY;

-- Allow all operations via anon key (data is encrypted client-side)
-- For production, restrict to authenticated users
CREATE POLICY "Allow all for anon" ON user_bets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON pending_bets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON commitment_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON market_registry FOR ALL USING (true) WITH CHECK (true);
