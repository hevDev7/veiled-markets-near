// The size meter on the create page counts what encodeMetadata will store: UTF-8 bytes of the untrimmed JSON.
import { describe, expect, it } from 'vitest';
import { MAX_METADATA, encodeMetadata, metadataBytes, metadataJson } from './chain';

describe('metadata size', () => {
  it('metadataBytes counts UTF-8 bytes, not characters', () => {
    expect(metadataBytes({ question: '€' }) - metadataBytes({ question: 'a' })).toBe(2);
  });

  it('metadataBytes equals the encoded length under the limit', () => {
    const m = {
      question: 'Will BTC close above $100,000 on 2026-11-20?',
      description: 'Resolves Yes if the close of the 14:30 UTC one-minute candle is above $100,000. Harga penutupan — €, 🚀.',
      resolutionSource: 'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60&start=1795185000&end=1795185600',
      outcomeLabels: ['Yes', 'No'],
    };
    expect(metadataJson(m)).toBe(encodeMetadata(m));
    expect(metadataBytes(m)).toBe(new TextEncoder().encode(encodeMetadata(m)).length);
    expect(metadataBytes(m)).toBeLessThanOrEqual(MAX_METADATA);
  });

  it('long rules exceed MAX_METADATA', () => {
    expect(MAX_METADATA).toBe(2048);
    expect(metadataBytes({ question: 'Q?', description: 'x'.repeat(2100) })).toBeGreaterThan(2048);
  });
});
