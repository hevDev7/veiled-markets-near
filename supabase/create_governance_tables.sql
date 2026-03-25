-- ============================================================================
-- VEILED MARKETS — Governance Tables for Supabase
-- ============================================================================
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================================

-- 1. Governance Proposals
CREATE TABLE IF NOT EXISTS governance_proposals (
  proposal_id TEXT PRIMARY KEY,
  proposer TEXT NOT NULL,
  proposal_type INTEGER NOT NULL DEFAULT 1,
  proposal_type_name TEXT DEFAULT 'Unknown',
  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  target TEXT DEFAULT '0field',
  payload_1 TEXT DEFAULT '0',
  payload_2 TEXT DEFAULT '0field',
  votes_for TEXT DEFAULT '0',
  votes_against TEXT DEFAULT '0',
  quorum_required TEXT DEFAULT '0',
  status INTEGER DEFAULT 1,  -- 1=Active, 2=Passed, 3=Rejected, 4=Executed, 5=Vetoed
  created_at_ts TIMESTAMPTZ DEFAULT NOW(),
  voting_deadline TEXT DEFAULT '0',
  transaction_id TEXT,
  executed_tx_id TEXT
);

-- 2. Governance Votes (track who voted)
CREATE TABLE IF NOT EXISTS governance_votes (
  id BIGSERIAL PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES governance_proposals(proposal_id),
  voter TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('for', 'against')),
  amount TEXT DEFAULT '0',
  transaction_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id, voter)
);

-- 3. Resolver Rewards (track claimable rewards)
CREATE TABLE IF NOT EXISTS resolver_rewards (
  id BIGSERIAL PRIMARY KEY,
  resolver_address TEXT NOT NULL,
  market_id TEXT NOT NULL,
  reward_amount TEXT DEFAULT '0',
  claimed BOOLEAN DEFAULT FALSE,
  claim_tx_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(resolver_address, market_id)
);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE governance_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE resolver_rewards ENABLE ROW LEVEL SECURITY;

-- Public read access (anyone can view proposals/votes/rewards)
CREATE POLICY "Public read governance_proposals" ON governance_proposals
  FOR SELECT USING (true);

CREATE POLICY "Public read governance_votes" ON governance_votes
  FOR SELECT USING (true);

CREATE POLICY "Public read resolver_rewards" ON resolver_rewards
  FOR SELECT USING (true);

-- Public insert/update (frontend writes with anon key)
CREATE POLICY "Public insert governance_proposals" ON governance_proposals
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public update governance_proposals" ON governance_proposals
  FOR UPDATE USING (true);

CREATE POLICY "Public insert governance_votes" ON governance_votes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public insert resolver_rewards" ON resolver_rewards
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public update resolver_rewards" ON resolver_rewards
  FOR UPDATE USING (true);
