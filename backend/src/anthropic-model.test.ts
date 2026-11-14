// The Claude client behind POST /draft and POST /review. The SDK's beta.messages.create is faked: no request leaves
// the machine and no key is needed.
// Run: npx tsx --test src/anthropic-model.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Anthropic from '@anthropic-ai/sdk';
import { APIConnectionTimeoutError, APIError } from '@anthropic-ai/sdk';
import { anthropicModel, FALLBACK_BETA } from './anthropic-model';
import { ModelFailure, ModelRefusal } from './market-ai';

type Messages = Pick<Anthropic['beta']['messages'], 'create'>;

function fakeClient(answer: () => unknown) {
  const seen: unknown[] = [];
  const client = {
    create: async (params: unknown) => {
      seen.push(params);
      return answer();
    },
  } as unknown as Messages;
  return { client, seen };
}

const reply = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [{ type: 'text', text: '{"ok":true}' }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  stop_details: null,
  usage: { input_tokens: 1200, output_tokens: 340 },
  ...over,
});

const REQ = {
  system: 'You review markets.',
  user: 'Review this market.',
  schema: { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } },
};

test('the request carries the model, the fallback beta, effort and the JSON schema', async () => {
  const { client, seen } = fakeClient(() => reply());
  const logged: string[] = [];
  const model = anthropicModel({ apiKey: 'sk-ant-test', model: 'claude-opus-5-5', log: (line) => logged.push(line) }, client);
  assert.deepEqual(await model(REQ), { ok: true });
  assert.equal(FALLBACK_BETA, 'server-side-fallback-2026-07-01');
  assert.deepEqual(seen, [
    {
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: 'You review markets.',
      messages: [{ role: 'user', content: 'Review this market.' }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: REQ.schema } },
    },
  ]);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /claude-opus-5-5: 1200 in, 340 out/);
  assert.doesNotMatch(logged[0], /sk-ant-test/);
});

test('a refusal throws ModelRefusal without reading content', async () => {
  const refused = reply({ stop_reason: 'refusal' });
  Object.defineProperty(refused, 'content', {
    get() {
      throw new Error('content was read');
    },
  });
  const { client } = fakeClient(() => refused);
  await assert.rejects(anthropicModel({ apiKey: 'k', model: 'claude-opus-5-5' }, client)(REQ), ModelRefusal);
});

test('the answer is the first text block, after the last fallback block when a model declined', async () => {
  const call = (content: unknown[]) => anthropicModel({ apiKey: 'k', model: 'claude-opus-5-5' }, fakeClient(() => reply({ content })).client)(REQ);
  assert.deepEqual(
    await call([
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: '{"scores":{"clarity":8}}' },
      { type: 'text', text: 'not this one' },
    ]),
    { scores: { clarity: 8 } },
  );
  // The SDK's BetaFallbackBlock: what comes before it is the declining model's output, the answer comes after it.
  const hop = (from: string, to: string) => ({ type: 'fallback', from: { model: from }, to: { model: to }, trigger: { type: 'refusal', category: null } });
  assert.deepEqual(
    await call([
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: '{"scores":{"cla' },
      hop('claude-opus-5-5', 'claude-opus-5'),
      { type: 'text', text: 'Partial text from the second model.' },
      hop('claude-opus-5', 'claude-sonnet-5-5'),
      { type: 'thinking', thinking: '', signature: 'sig2' },
      { type: 'text', text: '{"scores":{"clarity":7}}' },
    ]),
    { scores: { clarity: 7 } },
  );
});

test('an answer cut off at max_tokens, without text, or not JSON is a ModelFailure', async () => {
  for (const answer of [
    reply({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"scores":{"cla' }] }),
    reply({ content: [{ type: 'thinking', thinking: '', signature: 'sig' }] }),
    reply({ content: [{ type: 'text', text: 'Here is the market: …' }] }),
  ]) {
    const { client } = fakeClient(() => answer);
    await assert.rejects(anthropicModel({ apiKey: 'k', model: 'claude-opus-5-5' }, client)(REQ), ModelFailure, JSON.stringify(answer));
  }
});

test('an APIError becomes ModelFailure', async () => {
  const overloaded = new APIError(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, 'Overloaded', new Headers());
  for (const error of [overloaded, new APIConnectionTimeoutError()]) {
    const { client } = fakeClient(() => {
      throw error;
    });
    await assert.rejects(anthropicModel({ apiKey: 'k', model: 'claude-opus-5-5' }, client)(REQ), ModelFailure);
  }
});
