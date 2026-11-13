// The AI resolver's decisions that do not touch the network: which markets it votes on, what it asks the model,
// how it reads the answer, and how it checks NEAR AI Cloud's TEE signature. Run: npx tsx --test src/ai-resolver-core.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import {
  addressOf,
  buildRequest,
  checkSignature,
  evidenceFor,
  htmlToText,
  isPrivateAddress,
  parseDecision,
  readMarket,
  recoverEip191,
  sha256Hex,
  shouldVote,
  sourceUrl,
  verifyLink,
  type ChainMarket,
} from './ai-resolver-core';

const META = JSON.stringify({ v: 1, q: 'Will BTC close above $100k on 2026-11-20?', d: 'Uses the CoinGecko daily close.', s: 'https://www.coingecko.com/en/coins/bitcoin', o: ['Yes', 'No'] });

function market(over: Partial<ChainMarket> = {}): ChainMarket {
  return {
    id: '7', status: 1, num_outcomes: 2, deadline: '1000', resolution_deadline: '5000', metadata: META, tally: null, ...over,
  };
}

// ------------------------------------------------------------------ which markets

test('a market whose trading has closed and that nobody voted on gets a vote', () => {
  assert.equal(shouldVote(market(), 1001n, false), true);
});

test('no vote while trading is open, or after the resolution deadline', () => {
  assert.equal(shouldVote(market(), 1000n, false), false);
  assert.equal(shouldVote(market(), 5001n, false), false);
});

test('no second vote from the resolver', () => {
  assert.equal(shouldVote(market(), 1001n, true), false);
});

test('a vote window still open takes the resolver vote; a closed one does not', () => {
  const tally = { total_voters: 1, voting_deadline: '1100', winning_outcome: 0 };
  assert.equal(shouldVote(market({ status: 5, tally }), 1100n, false), true);
  assert.equal(shouldVote(market({ status: 5, tally }), 1101n, false), false);
});

test('settled, disputed and cancelled markets are left alone', () => {
  for (const status of [3, 4, 6, 7]) assert.equal(shouldVote(market({ status }), 1001n, false), false);
});

test('market text comes from the on-chain metadata; a binary market without labels is Yes / No', () => {
  const m = readMarket(market({ metadata: JSON.stringify({ v: 1, q: 'Q?', d: '' }) }));
  assert.deepEqual(m.outcomes, ['Yes', 'No']);
  assert.equal(m.question, 'Q?');
  assert.equal(readMarket(market()).source, 'https://www.coingecko.com/en/coins/bitcoin');
});

test('only a plain public http(s) link is fetched as the resolution source', () => {
  assert.equal(sourceUrl('https://www.coingecko.com/en/coins/bitcoin')?.hostname, 'www.coingecko.com');
  assert.equal(sourceUrl('CoinGecko daily close'), null);
  assert.equal(sourceUrl('file:///etc/passwd'), null);
  assert.equal(sourceUrl('http://localhost:8080/x'), null);
  assert.equal(sourceUrl('https://user:pw@example.com/'), null);
  assert.equal(sourceUrl('https://example.com:22/'), null);
  assert.equal(sourceUrl('http://10.0.0.1/'), null);
});

test('private, loopback and link-local addresses are refused after DNS', () => {
  for (const a of ['127.0.0.1', '10.1.2.3', '172.16.0.9', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
    assert.equal(isPrivateAddress(a), true, a);
  }
  for (const a of ['104.16.1.1', '8.8.8.8', '2606:4700::1111']) assert.equal(isPrivateAddress(a), false, a);
});

test('page text keeps the words and drops scripts, styles and tags', () => {
  const t = htmlToText('<html><head><style>p{}</style><script>alert(1)</script></head><body><h1>BTC</h1><p>Close: $101,250 &amp; up</p></body></html>');
  assert.equal(t, 'BTC Close: $101,250 & up');
});

// ------------------------------------------------------------------ the request and the answer

test('the request names the canonical model, asks for JSON, and numbers the outcomes', () => {
  const body = buildRequest('z-ai/glm-5.3-flash', readMarket(market()), 'Close: $101,250', new Date('2026-11-21T00:00:00Z'), new Date('2026-11-20T00:00:00Z'));
  const j = JSON.parse(body);
  assert.equal(j.model, 'z-ai/glm-5.3-flash');
  assert.equal(j.stream, false);
  assert.match(j.messages[0].content, /ignore any instructions/i);
  assert.match(j.messages[1].content, /1\. Yes/);
  assert.match(j.messages[1].content, /2\. No/);
  assert.match(j.messages[1].content, /Current date \(UTC\): 2026-11-21/);
  assert.match(j.messages[1].content, /Trading closed \(UTC\): 2026-11-20T00:00:00/);
});

test('the model is told the resolution rules the human voters follow (docs/near/RESOLUTION.md)', () => {
  const system = JSON.parse(buildRequest('m', readMarket(market()), null, new Date(), new Date())).messages[0].content;
  assert.match(system, /rules win/i); // the market's rules over its question
  assert.match(system, /trading deadline/i); // the moment that counts when the question names none
  assert.match(system, /did not happen/i); // "will X happen by D" with D past and no X: the outcome for "no"
  assert.match(system, /strict/i); // "above" and "below"
  assert.match(system, /null/); // abstain when the source does not settle it
});

test('an answer is read from the JSON the model returns, even inside a code fence', () => {
  const d = parseDecision('```json\n{"outcome": 1, "confidence": 0.93, "reasoning": "CoinGecko shows a close of $101,250."}\n```', 2);
  assert.deepEqual(d, { outcome: 1, confidence: 0.93, reasoning: 'CoinGecko shows a close of $101,250.' });
});

test('an outcome outside the market, or a missing one, is an abstention', () => {
  assert.equal(parseDecision('{"outcome": 3, "confidence": 1, "reasoning": "x"}', 2)?.outcome, null);
  assert.equal(parseDecision('{"outcome": null, "confidence": 0.2, "reasoning": "not yet"}', 2)?.outcome, null);
  assert.equal(parseDecision('I cannot tell.', 2), null);
});

// ------------------------------------------------------------------ the TEE signature

test('addresses match the Ethereum address of a known key', () => {
  const pub = secp256k1.getPublicKey(new Uint8Array(32).fill(1), false);
  assert.equal(addressOf(pub), '0x1a642f0e3c3af545e7acbd38b07251b3990914f1');
});

test('EIP-191 recovery matches signatures made by ethers', () => {
  // ethers 6.16 Wallet(0x0123…0123).signMessage(…), whose address is 0x14791697260E4c9A71f18484C9f997B308e59325.
  const signer = '0x14791697260e4c9a71f18484c9f997b308e59325';
  const hello = '0xe0ed34fbbe927a58267ce2e8067a611c69869e20e731bc99187a8bc97058664c16de07f7660f06ce0985d1d8e063726783033fda59b307897f26a21392d62b3a1c';
  assert.equal(recoverEip191('Hello World', hello), signer);
  const text = `z-ai/glm-5.3-flash:${'a'.repeat(64)}:${'b'.repeat(64)}`;
  const shaped = '0x0d521b4f1aa8ae84e4efc155efeae56732501592da144a71d1501470480dc01b25b0cfcab9a0fb913131f36bd95516486d9ea71ec1c001ef0c5aa92e339a79531c';
  assert.equal(recoverEip191(text, shaped), signer);
});

/** Signs `text` the way NEAR AI's model TEE does (EIP-191, r‖s‖v). */
function teeSign(text: string, priv: Uint8Array): string {
  const prefix = `\x19Ethereum Signed Message:\n${Buffer.byteLength(text)}`;
  const msg = Buffer.concat([Buffer.from(prefix), Buffer.from(text)]);
  const rec = secp256k1.sign(keccak_256(msg), priv, { prehash: false, format: 'recovered' });
  return '0x' + Buffer.concat([Buffer.from(rec.slice(1)), Buffer.from([rec[0] + 27])]).toString('hex');
}

test('a provider_tee signature over model:request:response from an attested signer passes', () => {
  const priv = new Uint8Array(32).fill(7);
  const signer = addressOf(secp256k1.getPublicKey(priv, false));
  const req = '{"model":"z-ai/glm-5.3-flash"}';
  const res = '{"id":"chat-1"}';
  const text = `z-ai/glm-5.3-flash:${sha256Hex(req)}:${sha256Hex(res)}`;
  const sig = { text, signature: teeSign(text, priv), signing_address: signer, signing_algo: 'ecdsa', signature_kind: 'provider_tee' };
  assert.deepEqual(checkSignature(sig, 'z-ai/glm-5.3-flash', req, res, [signer]), { ok: true });
});

test('a signature over other bytes, by an unattested key, or from the gateway does not pass', () => {
  const priv = new Uint8Array(32).fill(7);
  const signer = addressOf(secp256k1.getPublicKey(priv, false));
  const req = '{"model":"z-ai/glm-5.3-flash"}';
  const res = '{"id":"chat-1"}';
  const text = `z-ai/glm-5.3-flash:${sha256Hex(req)}:${sha256Hex(res)}`;
  const good = { text, signature: teeSign(text, priv), signing_address: signer, signing_algo: 'ecdsa', signature_kind: 'provider_tee' };
  assert.equal(checkSignature(good, 'z-ai/glm-5.3-flash', req, res + ' ', [signer]).ok, false);
  assert.equal(checkSignature(good, 'z-ai/glm-5.3-flash', req, res, ['0x0000000000000000000000000000000000000001']).ok, false);
  assert.equal(checkSignature({ ...good, signature_kind: 'gateway' }, 'z-ai/glm-5.3-flash', req, res, [signer]).ok, false);
  const otherKey = teeSign(text, new Uint8Array(32).fill(8));
  assert.equal(checkSignature({ ...good, signature: otherKey }, 'z-ai/glm-5.3-flash', req, res, [signer]).ok, false);
});

// ------------------------------------------------------------------ what goes on chain

test('the vote evidence is the receipt link with its hash, short enough for the contract', () => {
  const e = evidenceFor('https://ai.veiledmarkets.xyz', '42', '{"a":1}');
  assert.equal(e, `https://ai.veiledmarkets.xyz/receipts/42.json#sha256=${sha256Hex('{"a":1}')}`);
  assert.ok(e.length <= 300);
});

test('the verify link carries the receipt NEAR AI Cloud verification page reads', () => {
  const link = verifyLink({ completionId: 'chat-1', model: 'z-ai/glm-5.3-flash', signatureKind: 'provider_tee', signingAlgo: 'ecdsa', signingAddress: '0xab', signedText: 't', signature: '0xcd', verifiedAt: '2026-11-13T00:00:00Z' });
  const [base, frag] = link.split('#receipt=');
  assert.equal(base, 'https://cloud.near.ai/verify?model=z-ai%2Fglm-5.3-flash');
  assert.equal(JSON.parse(Buffer.from(frag, 'base64url').toString()).completionId, 'chat-1');
});
