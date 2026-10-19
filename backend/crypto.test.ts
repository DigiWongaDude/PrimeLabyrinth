import { test, expect } from 'vitest';
import { scryptSync } from 'node:crypto';

test('Workers supports OWASP scrypt parameters within a 32 MiB allocation', () => {
  const hash = scryptSync('test-password-with-enough-length', '0123456789abcdef', 32,
    { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 });
  expect(hash.length).toBe(32);
});
