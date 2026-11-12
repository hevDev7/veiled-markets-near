// Image hosts drop photos; a market whose thumbnail fails to load shows its category image instead of an empty box.
import { describe, expect, it } from 'vitest';
import { getMarketThumbnail, thumbnailFallback } from './market-thumbnails';

const fakeImg = (src: string) => ({ src, dataset: {} as Record<string, string>, style: { display: '' } });

describe('thumbnailFallback', () => {
  it('swaps a broken thumbnail for the category image, then hides it if that breaks too', () => {
    const categoryImage = getMarketThumbnail('A question with no keyword', 5);
    const img = fakeImg('https://images.unsplash.com/photo-gone');
    const onError = thumbnailFallback(5);

    onError({ currentTarget: img as unknown as HTMLImageElement });
    expect(img.src).toBe(categoryImage);
    expect(img.style.display).toBe('');

    onError({ currentTarget: img as unknown as HTMLImageElement });
    expect(img.style.display).toBe('none');
  });
});
