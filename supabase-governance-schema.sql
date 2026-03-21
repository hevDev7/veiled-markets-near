-- ============================================================================
-- VEILED GOVERNANCE — Supabase Schema Migration
-- ============================================================================
-- Run this SQL in Supabase SQL Editor to create governance tables.
-- ============================================================================

-- ============================================================================
-- 1. GOVERNANCE PROPOSALS (indexed from on-chain)
-- ============================================================================
CREATE TABLE IF NOT EXISTS governance_proposals (
    proposal_id       TEXT PRIMARY KEY,
    proposer          TEXT NOT NULL,
    proposal_type     SMALLINT NOT NULL,
    proposal_type_name TEXT NOT NULL,
    title             TEXT NOT NULL,
    description       TEXT,
    target            TEXT,
    payload_1         NUMERIC,
    payload_2         TEXT,
    votes_for         NUMERIC DEFAULT 0,
    votes_against     NUMERIC DEFAULT 0,
    quorum_required   NUMERIC NOT NULL,
    quorum_met        BOOLEAN DEFAULT false,
    status            TEXT DEFAULT 'active',
    created_at        BIGINT,
    voting_deadline   BIGINT NOT NULL,
    timelock_until    BIGINT DEFAULT 0,
    executed_at       TIMESTAMPTZ,
    execution_tx      TEXT,
    created_at_ts     TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gov_proposals_status ON governance_proposals(status);
CREATE INDEX IF NOT EXISTS idx_gov_proposals_type ON governance_proposals(proposal_type);
CREATE INDEX IF NOT EXISTS idx_gov_proposals_created ON governance_proposals(created_at_ts DESC);

-- ============================================================================
-- 2. GOVERNANCE VOTES (individual votes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS governance_votes (
    id                SERIAL PRIMARY KEY,
    proposal_id       TEXT NOT NULL REFERENCES governance_proposals(proposal_id),
    voter             TEXT NOT NULL,
    vote_direction    TEXT NOT NULL,
    veil_weight       NUMERIC NOT NULL,
    voted_at          TIMESTAMPTZ DEFAULT now(),
    transaction_id    TEXT,
    UNIQUE(proposal_id, voter)
);

CREATE INDEX IF NOT EXISTS idx_gov_votes_proposal ON governance_votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_gov_votes_voter ON governance_votes(voter);

-- ============================================================================
-- 3. VEIL TOKEN REWARDS
-- ============================================================================
CREATE TABLE IF NOT EXISTS veil_rewards (
    id                SERIAL PRIMARY KEY,
    user_address      TEXT NOT NULL,
    epoch_id          INTEGER NOT NULL,
    reward_type       TEXT NOT NULL,
    market_id         TEXT,
    amount            NUMERIC NOT NULL,
    claimed           BOOLEAN DEFAULT false,
    claimed_at        TIMESTAMPTZ,
    claim_tx          TEXT,
    UNIQUE(user_address, epoch_id, reward_type, COALESCE(market_id, ''))
);

CREATE INDEX IF NOT EXISTS idx_veil_rewards_user ON veil_rewards(user_address);
CREATE INDEX IF NOT EXISTS idx_veil_rewards_epoch ON veil_rewards(epoch_id);
CREATE INDEX IF NOT EXISTS idx_veil_rewards_unclaimed ON veil_rewards(claimed) WHERE claimed = false;

-- ============================================================================
-- 4. DELEGATION TRACKING
-- ============================================================================
CREATE TABLE IF NOT EXISTS veil_delegations (
    id                SERIAL PRIMARY KEY,
    delegator         TEXT NOT NULL,
    delegate_to       TEXT NOT NULL,
    amount            NUMERIC NOT NULL,
    delegated_at      TIMESTAMPTZ DEFAULT now(),
    revoked_at        TIMESTAMPTZ,
    active            BOOLEAN DEFAULT true,
    transaction_id    TEXT,
    UNIQUE(delegator, delegate_to) 
);

CREATE INDEX IF NOT EXISTS idx_delegations_delegate ON veil_delegations(delegate_to) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_delegations_delegator ON veil_delegations(delegator) WHERE active = true;

-- ============================================================================
-- 5. COMMITTEE VOTES (for dispute resolution)
-- ============================================================================
CREATE TABLE IF NOT EXISTS committee_votes (
    id                SERIAL PRIMARY KEY,
    market_id         TEXT NOT NULL,
    committee_member  TEXT NOT NULL,
    proposed_outcome  SMALLINT NOT NULL,
    voted_at          TIMESTAMPTZ DEFAULT now(),
    transaction_id    TEXT,
    UNIQUE(market_id, committee_member)
);

CREATE INDEX IF NOT EXISTS idx_committee_votes_market ON committee_votes(market_id);

-- ============================================================================
-- 6. RESOLUTION ESCALATION TRACKING
-- ============================================================================
CREATE TABLE IF NOT EXISTS resolution_escalations (
    market_id         TEXT PRIMARY KEY,
    current_tier      SMALLINT NOT NULL DEFAULT 1,
    original_resolver TEXT NOT NULL,
    original_outcome  SMALLINT,
    disputer          TEXT,
    dispute_bond      NUMERIC,
    dispute_outcome   SMALLINT,
    committee_outcome SMALLINT,
    community_proposal_id TEXT REFERENCES governance_proposals(proposal_id),
    final_outcome     SMALLINT,
    escalated_at      TIMESTAMPTZ DEFAULT now(),
    resolved_at       TIMESTAMPTZ,
    status            TEXT DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_escalations_status ON resolution_escalations(status);

-- ============================================================================
-- 7. RESOLVER REPUTATION
-- ============================================================================
CREATE TABLE IF NOT EXISTS resolver_reputation (
    resolver_address  TEXT PRIMARY KEY,
    tier              SMALLINT DEFAULT 1,
    stake_amount      NUMERIC DEFAULT 0,
    markets_resolved  INTEGER DEFAULT 0,
    disputes_received INTEGER DEFAULT 0,
    disputes_upheld   INTEGER DEFAULT 0,
    disputes_rejected INTEGER DEFAULT 0,
    strikes           INTEGER DEFAULT 0,
    total_veil_reward NUMERIC DEFAULT 0,
    total_veil_slashed NUMERIC DEFAULT 0,
    reputation_score  NUMERIC DEFAULT 100.0,
    registered_at     TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 8. GOVERNANCE STATISTICS (materialized counters)
-- ============================================================================
CREATE TABLE IF NOT EXISTS governance_stats (
    stat_key          TEXT PRIMARY KEY,
    stat_value        NUMERIC NOT NULL,
    updated_at        TIMESTAMPTZ DEFAULT now()
);

INSERT INTO governance_stats (stat_key, stat_value) VALUES
    ('total_supply', 100000000000000),
    ('circulating_supply', 0),
    ('total_staked_votes', 0),
    ('total_proposals', 0),
    ('total_proposals_passed', 0),
    ('total_proposals_executed', 0),
    ('total_proposals_vetoed', 0),
    ('total_veil_distributed_lp', 0),
    ('total_veil_distributed_trading', 0)
ON CONFLICT (stat_key) DO NOTHING;

-- ============================================================================
-- 9. REWARD EPOCHS
-- ============================================================================
CREATE TABLE IF NOT EXISTS reward_epochs (
    epoch_id          INTEGER PRIMARY KEY,
    total_lp_reward   NUMERIC NOT NULL DEFAULT 0,
    total_trader_reward NUMERIC NOT NULL DEFAULT 0,
    total_lp_contributions NUMERIC NOT NULL DEFAULT 0,
    total_trade_volume NUMERIC NOT NULL DEFAULT 0,
    started_at        BIGINT,
    ended_at          BIGINT,
    distributed       BOOLEAN DEFAULT false,
    created_at        TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE governance_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE veil_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE veil_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE committee_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE resolution_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE resolver_reputation ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_epochs ENABLE ROW LEVEL SECURITY;

-- Allow all for anon (data is public governance data)
CREATE POLICY "Allow all for anon" ON governance_proposals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON governance_votes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON veil_rewards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON veil_delegations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON committee_votes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON resolution_escalations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON resolver_reputation FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON governance_stats FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON reward_epochs FOR ALL USING (true) WITH CHECK (true);
