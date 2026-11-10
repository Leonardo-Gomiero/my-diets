import { describe, expect, it } from 'vitest';
import { whatsappUrl } from './contactLinks.js';

describe('whatsappUrl', () => {
  it('adds Brazil country code to local phone numbers', () => {
    expect(whatsappUrl('(11) 99999-9999')).toBe('https://wa.me/5511999999999');
  });

  it('preserves international country codes and rejects unusable values', () => {
    expect(whatsappUrl('+1 (555) 123-4567')).toBe('https://wa.me/15551234567');
    expect(whatsappUrl('not a phone')).toBeNull();
    expect(whatsappUrl(null)).toBeNull();
  });
});
