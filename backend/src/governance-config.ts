// ============================================================================
// VEILED GOVERNANCE — Backend Indexer Configuration
// ============================================================================

export const GOVERNANCE_CONFIG = {
  // Program
  programId: process.env.GOV_PROGRAM_ID || 'veiled_governance_v4.aleo',
  marketProgramId: process.env.PROGRAM_ID || 'veiled_markets_v35.aleo',

  // API
  apiBaseUrl: process.env.ALEO_RPC_URL || 'https://api.explorer.provable.com/v1/testnet',
  
  // Supabase
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_ANON_KEY || '',

  // Polling
  pollIntervalMs: 15_000,        // 15 seconds
  maxBlocksPerScan: 100,

  // Block time
  secondsPerBlock: 15,
};
