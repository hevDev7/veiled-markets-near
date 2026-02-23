import { devLog } from './logger'
// ============================================================================
// QUESTION HASH TO TEXT MAPPING (DEPRECATED)
// ============================================================================
// DEPRECATED: New markets use IPFS (Pinata) for metadata storage.
// This file is only kept for legacy markets that predate IPFS integration.
// Do NOT add new entries here — they are stored via IPFS + Supabase automatically.
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
        // v11 Markets
        '199256489517560145210770207786012803328580705006779439094316053093311700235field':
            'Will Bitcoin reach $200,000 by end of 2026?',
        '341503629126170250315810947235827906828815810007489780406744544099747863721field':
            'Elon Musk # tweets February 17 - February 24, 2026?',
        '98500208261997071054185428348098687624938170915548074073042581842839764949field':
            'Donald Trump # Truth Social posts February 17 - February 24, 2026?',
        '116335730097508690742903665793629632313182018376835131016221114398214112324field':
            'Will Netflix (NFLX) finish week of February 16 above___?',
        '13900054072139873439474767478848166999910561868830569026142929286684344244field':
            'Number of TSA Passengers February 19?',
        '162155484657694393332018725357556524338851780166796185726003158487358722931field':
            'Donald Trump # Truth Social posts February 17 - February 24, 2026?',
        '406774174754657008606632867679950228033459194249064235621748894678492350025field':
            'Top performing Magnificent 7 company week of February 16?',
        '151444978499671904346901917935838859453134777258960470512143295431593983111field':
            'February Inflation US - Annual',
        '346327790851084165425520635863465586319424277025802042707957571165830502545field':
            'USDCX Test Market (Crypto)',
        // v12 Markets
        '410192925985505437726307074757885903260307666652937815882765391752105890555field':
            'Will Bitcoin reach $200,000 by end of 2026?',
        '349636416100277263609921599797442849479398100974375483429138515307377610240field':
            'New v12 Market (Category: Economics)',
        // v13 Markets
        '408739187905470065092184393909901455401219986313980106810029469554023861834field':
            'v13 Test Market',
        '11439292176139327630002641630961458371928908331097989185830026473591683565field':
            'v13 Test Market #3 (10 ALEO)',
        '203062924841093475657167492352758050834126761259472774201227535115909615529field':
            'v13 Test Market #4 (4 ALEO)',
        // v16 Markets
        '165883322325996755783327542868659318920617125945968052068595979002561098149field':
            'v16 Market #1 (Crypto)',
        '254245454576077222504075846193933517141788713965373809753159770242046615943field':
            'v16 Market #2 (Crypto)',
    };

    // Store in localStorage
    if (typeof window !== 'undefined') {
        try {
            const existing = localStorage.getItem('veiled_markets_questions');
            const existingMap = existing ? JSON.parse(existing) : {};

            // Merge with existing mappings (don't overwrite user-created markets)
            const merged = { ...existingMap, ...mappings };

            localStorage.setItem('veiled_markets_questions', JSON.stringify(merged));
            devLog('✅ Initialized question text mappings for', Object.keys(mappings).length, 'markets');
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
            devLog('✅ Added question mapping:', hash.slice(0, 16) + '...', '→', question);
        } catch (e) {
            console.error('Failed to add question mapping:', e);
        }
    }
}
