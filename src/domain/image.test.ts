import { describe, expect, it } from 'vitest';
import { filterAndSortImages, isSupportedImageName } from './image';
import type { ImageFile } from '../types';

const image = (name: string, size: number, lastModified: number, rating = 0): ImageFile => ({
  id: name,
  name,
  url: `local:///${name}`,
  size,
  type: 'image/jpeg',
  lastModified,
  path: name,
  source: 'folder',
  metadata: { favorite: false, rating, colorLabel: null, tags: [] },
});

describe('image domain rules', () => {
  it('recognizes supported image extensions case-insensitively', () => {
    expect(isSupportedImageName('photo.JPEG')).toBe(true);
    expect(isSupportedImageName('photo.heic')).toBe(false);
    expect(isSupportedImageName('photo')).toBe(false);
  });

  it('filters and sorts names naturally', () => {
    const result = filterAndSortImages(
      [image('photo10.jpg', 10, 1), image('photo2.jpg', 20, 2), image('notes.png', 30, 3)],
      'photo'
    );
    expect(result.map((item) => item.name)).toEqual(['photo2.jpg', 'photo10.jpg']);
  });

  it('supports descending size and metadata filters', () => {
    const first = image('first.jpg', 10, 1, 3);
    first.metadata = { favorite: true, rating: 3, colorLabel: null, tags: [] };
    const second = image('second.jpg', 20, 2, 5);
    second.metadata = { favorite: false, rating: 5, colorLabel: null, tags: [] };
    expect(filterAndSortImages([first, second], '', 'size', 'desc', true).map((item) => item.name)).toEqual([
      'first.jpg',
    ]);
    expect(filterAndSortImages([first, second], '', 'rating', 'desc').map((item) => item.name)).toEqual([
      'second.jpg',
      'first.jpg',
    ]);
  });

  it('sorts by file type before using the file name as a tie breaker', () => {
    const result = filterAndSortImages(
      [image('z.webp', 10, 1), image('a.jpg', 10, 1), image('m.png', 10, 1)],
      '',
      'type'
    );
    expect(result.map((item) => item.name)).toEqual(['a.jpg', 'm.png', 'z.webp']);
  });

  it('filters by format, size, and modified date', () => {
    const result = filterAndSortImages(
      [image('small.jpg', 500, 100), image('large.png', 2_000_000, 200), image('recent.png', 3_000_000, 300)],
      '',
      'name',
      'asc',
      false,
      0,
      { format: 'png', minSizeBytes: 1_000_000, modifiedAfter: 150 }
    );
    expect(result.map((item) => item.name)).toEqual(['large.png', 'recent.png']);
  });
});
