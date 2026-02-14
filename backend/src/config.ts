// ============================================================================
// VEILED MARKETS - Backend Configuration
// ============================================================================

export const config = {
    rpcUrl: process.env.VITE_ALEO_RPC_URL || 'https://api.explorer.provable.com/v1/testnet',
    programId: process.env.VITE_PROGRAM_ID || 'veiled_markets_v10.aleo',
    network: process.env.VITE_NETWORK || 'testnet',
    explorerUrl: process.env.VITE_EXPLORER_URL || 'https://explorer.provable.com/testnet',
};
