// The model behind AI drafting and review: Claude through the official SDK, with the owner's key (MARKET_AI_API_KEY,
// always passed in, never read from the environment here) and model (MARKET_AI_MODEL, claude-opus-5-5 by default).
// Each call asks for JSON in the caller's schema (structured outputs) at medium effort; Claude Opus 5.5 always thinks,
// and effort is how much. Server-side fallback is on: when Claude declines, the API retries the request on the model
// Anthropic recommends for that case. A refusal that remains is ModelRefusal; an API error, an answer cut off at the
// token limit, or one that is not JSON is ModelFailure.
import Anthropic, { APIError } from '@anthropic-ai/sdk';
import { ModelFailure, ModelRefusal, type ModelCall } from './market-ai';

export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_TOKENS = 16_000;
const TIMEOUT_MS = 120_000;

type MessagesClient = Pick<Anthropic['beta']['messages'], 'create'>;

export function anthropicModel(
  cfg: { apiKey: string; model: string; log?(line: string): void },
  client?: MessagesClient,
): ModelCall {
  const messages = client ?? new Anthropic({ apiKey: cfg.apiKey, maxRetries: 1, timeout: TIMEOUT_MS }).beta.messages;
  return async ({ system, user, schema }) => {
    const started = Date.now();
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await messages.create({
        model: cfg.model,
        max_tokens: MAX_TOKENS,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        system,
        messages: [{ role: 'user', content: user }],
        output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      });
    } catch (e) {
      if (e instanceof APIError) throw new ModelFailure(`Anthropic API: ${e.status ?? 'no response'} ${e.message}`);
      throw e;
    }
    const usage = message.usage;
    cfg.log?.(
      `[market-ai] ${message.model}: ${usage?.input_tokens ?? '?'} in, ${usage?.output_tokens ?? '?'} out, ` +
        `${((Date.now() - started) / 1000).toFixed(1)} s, ${message.stop_reason}`,
    );
    // A refusal's content need not match the schema, so it is never read.
    if (message.stop_reason === 'refusal') throw new ModelRefusal();
    if (message.stop_reason === 'max_tokens') throw new ModelFailure('The answer was cut off at the token limit.');
    // Content before a fallback block is the output of a model that declined; the model that answered starts after the
    // last one. Its thinking can come first: take its first text block.
    let answerStart = 0;
    message.content.forEach((block, i) => {
      if (block.type === 'fallback') answerStart = i + 1;
    });
    const text = message.content.slice(answerStart).find((block) => block.type === 'text');
    if (!text || text.type !== 'text') throw new ModelFailure('The answer held no text.');
    try {
      return JSON.parse(text.text) as unknown;
    } catch {
      throw new ModelFailure('The answer was not JSON.');
    }
  };
}
