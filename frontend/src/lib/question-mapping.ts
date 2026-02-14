// ============================================================================
// QUESTION HASH TO TEXT MAPPING
// ============================================================================
// Maps on-chain question hashes to human-readable questions
// This is needed because blockchain only stores hashes, not full text
// ============================================================================

/**
 * Initialize question text mappings for existing markets
 * Call this on app startup to populate the mapping
 * 
 * NOTE: veiled_markets_v9.aleo is the version 4 deployment with privacy fix
 * Includes delayed pool updates and noise addition for better privacy
 */
export function initializeQuestionMappings(): void {
    const mappings: Record<string, string> = {
        // v9 Markets (legacy)
        '1234567890field':
            'Will Bitcoin reach $150,000 by end of 2026?',
        '9876543210field':
            'Will Ethereum reach $10,000 by end of Q2 2026?',
        '5555555555field':
            'Will Solana reach $500 by end of 2026?',
        // v10 Markets
        '256405101151840648962409133633523383446118870689316654839429373790121035772field':
            'Will BTC reach $200k by end of 2026?',
        '335277485291523338300455425959878542481653519841988273486814275386244647837field':
            'Will SOL reach $250 by Feb 13, 2026?',
        '440149147741520429018871358059240796138407999260361667196147458351688115842field':
            'Will Ethereum reach $5,000 by March 2026?',
        '170581734373170323120054111589939112611634241828025336877451788205764410119field':
            'S&P 500 (SPX) Opens Up or Down on February 17?',
    };

    // Store in localStorage
    if (typeof window !== 'undefined') {
        try {
            const existing = localStorage.getItem('veiled_markets_questions');
            const existingMap = existing ? JSON.parse(existing) : {};

            // Merge with existing mappings (don't overwrite user-created markets)
            const merged = { ...existingMap, ...mappings };

            localStorage.setItem('veiled_markets_questions', JSON.stringify(merged));
            console.log('✅ Initialized question text mappings for', Object.keys(mappings).length, 'markets');
        } catch (e) {
            console.error('Failed to initialize question mappings:', e);
        }
    }
}

/**
 * Get all question mappings
 */
export function getAllQuestionMappings(): Record<string, string> {
    if (typeof window !== 'undefined') {
        try {
            const saved = localStorage.getItem('veiled_markets_questions');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            console.error('Failed to load question mappings:', e);
            return {};
        }
    }
    return {};
}

/**
 * Add a new question mapping (alias for addQuestionMapping)
 * Used when creating new markets
 */
export function registerQuestionText(hash: string, question: string): void {
    addQuestionMapping(hash, question);
}

/**
 * Add a new question mapping
 */
export function addQuestionMapping(hash: string, question: string): void {
    if (typeof window !== 'undefined') {
        try {
            const existing = getAllQuestionMappings();
            existing[hash] = question;
            localStorage.setItem('veiled_markets_questions', JSON.stringify(existing));
            console.log('✅ Added question mapping:', hash.slice(0, 16) + '...', '→', question);
        } catch (e) {
            console.error('Failed to add question mapping:', e);
        }
    }
}
