import { createHash } from 'node:crypto';
import { customAlphabet } from 'nanoid';

const EDIT_KEY_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const generateEditKey = customAlphabet(EDIT_KEY_ALPHABET, 24);
export const generateSlug = customAlphabet(EDIT_KEY_ALPHABET, 8);
export const generateRowId = customAlphabet(EDIT_KEY_ALPHABET, 16);

export function hashEditKey(rawKey: string, pepper: string): string {
  return createHash('sha256').update(`${rawKey}.${pepper}`, 'utf8').digest('hex');
}

export function hashedKeyPrefix(rawKey: string): string {
  return createHash('sha256').update(rawKey, 'utf8').digest('hex').slice(0, 8);
}

export function cookieNameForSlug(slug: string): string {
  return `sojourn_edit_${slug}`;
}
