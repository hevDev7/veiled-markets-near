// /market/933 showed "Market Not Found" whenever NearBlocks was rate limited: the page looked the market up by the raw
// route param ("933") while the markets list uses the UI id ("933field"), and only the hash-index redirect hid that.
import { describe, expect, it } from 'vitest';
import { routeMarketId } from './ids';

describe('routeMarketId', () => {
  it('turns a bare market id from the URL into the id the markets list uses', () => {
    expect(routeMarketId('933')).toBe('933field');
  });

  it('keeps an id that already has the UI spelling', () => {
    expect(routeMarketId('933field')).toBe('933field');
  });

  it('leaves anything that is not a market id alone', () => {
    expect(routeMarketId('not-a-market')).toBe('not-a-market');
  });
});
