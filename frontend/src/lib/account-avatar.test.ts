// Every account gets its own picture, drawn from nothing but its account id, so it is the same on every device
// and needs no upload or storage.
import { describe, expect, it } from 'vitest';
import { accountAvatar } from './account-avatar';

const signature = (id: string) => {
  const a = accountAvatar(id);
  return `${a.hue}:${a.cells.map((row) => row.map((on) => (on ? '#' : '.')).join('')).join('/')}`;
};

describe('accountAvatar', () => {
  it('draws the same picture for the same account every time', () => {
    expect(accountAvatar('alice.testnet')).toEqual(accountAvatar('alice.testnet'));
    expect(signature(' Alice.Testnet ')).toBe(signature('alice.testnet'));
  });

  it('draws a different picture for each of many accounts', () => {
    const ids = Array.from({ length: 400 }, (_, i) => `trader${i}.testnet`);
    ids.push('alice.testnet', 'alice1.testnet', 'alicf.testnet', 'bob.testnet', 'hardfrog6019.testnet');
    expect(new Set(ids.map(signature)).size).toBe(ids.length);
  });

  it('is a 5 by 5 grid mirrored left to right', () => {
    for (const id of ['alice.testnet', 'bob.testnet', 'veiled-markets.testnet']) {
      const { cells } = accountAvatar(id);
      expect(cells).toHaveLength(5);
      for (const row of cells) {
        expect(row).toHaveLength(5);
        expect(row[0]).toBe(row[4]);
        expect(row[1]).toBe(row[3]);
      }
    }
  });

  it('is never an empty or a solid square', () => {
    for (let i = 0; i < 2000; i++) {
      const filled = accountAvatar(`account-${i}.testnet`).cells.flat().filter(Boolean).length;
      expect(filled).toBeGreaterThanOrEqual(6);
      expect(filled).toBeLessThanOrEqual(19);
    }
  });

  it('picks a hue on the colour wheel', () => {
    const { hue } = accountAvatar('alice.testnet');
    expect(Number.isInteger(hue)).toBe(true);
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });
});
