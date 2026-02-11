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
 * NOTE: veiled_markets_v4.aleo is the version 4 deployment with privacy fix
 * Includes delayed pool updates and noise addition for better privacy
 */
export function initializeQuestionMappings(): void {
    const mappings: Record<string, string> = {
        // Market 1 - Crypto (Ethereum $10k) - First market on veiled_markets_privacy.aleo
        '3582024152336217571382682973364798990155453514672503623063651091171230848724field':
            'Will Ethereum reach $10,000 by end of Q2 2026?',
        // Market 2 - Crypto (Bitcoin $100k)
        '286436157692503798507031276544051911294111113992262510563720965993924436183field':
            'Will Bitcoin reach $100,000 by end of Q2 2026?',
        // Market 3 - Crypto (Ethereum $10k) - legacy veiled_market_v3.aleo
        '350929565016816493992297964402345071115472527106339097957348390879136520853field':
            'Will Ethereum reach $10,000 by end of Q2 2026?',
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
