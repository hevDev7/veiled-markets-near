// ============================================================================
// QUESTION HASH TO TEXT MAPPING
// ============================================================================
// Maps on-chain question hashes to human-readable questions
// This is needed because blockchain only stores hashes, not full text
// ============================================================================

/**
 * Initialize question text mappings for existing markets
 * Call this on app startup to populate the mapping
 */
export function initializeQuestionMappings(): void {
    const mappings: Record<string, string> = {
        // Market 1 - Crypto (Bitcoin)
        '7234567890123456789012345678901234567890123456789012345678901234field':
            'Will Bitcoin reach $100,000 by end of Q1 2026?',

        // Market 2 - Politics (Trump)
        '1234567890123456789012345678901234567890123456789012345678901234field':
            'Will Trump win the 2024 US Presidential Election?',

        // Market 3 - Sports (Lakers)
        '2345678901234567890123456789012345678901234567890123456789012345field':
            'Will Lakers win NBA Championship 2026?',

        // Market 4 - Crypto (Ethereum)
        '3456789012345678901234567890123456789012345678901234567890123456field':
            'Will Ethereum reach $5,000 by March 2026?',

        // Market 5 - Entertainment (Taylor Swift)
        '4567890123456789012345678901234567890123456789012345678901234567field':
            'Will Taylor Swift release a new album in 2026?',

        // Market 6 - Tech (Apple AR)
        '5678901234567890123456789012345678901234567890123456789012345678field':
            'Will Apple release AR glasses in 2026?',

        // Market 7 - Economics (Fed Rates)
        '6789012345678901234567890123456789012345678901234567890123456789field':
            'Will US Fed cut interest rates in Q1 2026?',

        // Market 8 - Science (SpaceX Mars)
        '7890123456789012345678901234567890123456789012345678901234567890field':
            'Will SpaceX land on Mars by 2030?',

        // Market 9 - NEW! Crypto (Ethereum $10k)
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
