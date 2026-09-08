import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizePreferences } = require('./preferences.js');

describe('thumbnail size preference', () => {
  it('keeps thumbnail size independent from the ribbon view mode', () => {
    const preferences = normalizePreferences({
      viewSize: 'small',
      thumbnailSize: 'large',
    });

    expect(preferences.viewSize).toBe('small');
    expect(preferences.thumbnailSize).toBe('large');
  });

  it('falls back to medium for missing or invalid thumbnail sizes', () => {
    expect(normalizePreferences({ viewSize: 'large-icons' }).thumbnailSize).toBe('medium');
    expect(normalizePreferences({ thumbnailSize: 'huge' }).thumbnailSize).toBe('medium');
  });
});
