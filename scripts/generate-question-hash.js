#!/usr/bin/env node

/**
 * Generate question hash for Aleo market creation
 * Aleo field requires decimal number format, not hex
 * Usage: node scripts/generate-question-hash.js "Your question here"
 */

const crypto = require('crypto');

async function hashToField(input) {
    // Use SHA-256 to hash the input
    const hash = crypto.createHash('sha256').update(input).digest();

    // Convert first 31 bytes to BigInt (Aleo field is ~253 bits)
    // We use 31 bytes (248 bits) to stay safely under the field modulus
    let value = BigInt(0);
    for (let i = 0; i < 31; i++) {
        value = (value << BigInt(8)) | BigInt(hash[i]);
    }

    // Convert to field format (decimal number + 'field')
    return `${value.toString()}field`;
}

// Get question from command line argument
const question = process.argv[2];

if (!question) {
    console.error('❌ Error: Please provide a question');
    console.log('Usage: node scripts/generate-question-hash.js "Your question here"');
    process.exit(1);
}

(async () => {
    const hash = await hashToField(question);

    console.log('');
    console.log('📝 Question Hash Generator (Aleo Field Format)');
    console.log('='.repeat(70));
    console.log('');
    console.log('Question:');
    console.log(`  "${question}"`);
    console.log('');
    console.log('Hash (Decimal Field Format):');
    console.log(`  ${hash}`);
    console.log('');
    console.log('✅ Use this hash in your leo execute command:');
    console.log(`  leo execute create_market "${hash}" "3u8" "14124471u64" "14141751u64" --broadcast`);
    console.log('');
    console.log('💡 Note: This is a decimal number, not hex. Aleo requires this format.');
    console.log('');
})();
