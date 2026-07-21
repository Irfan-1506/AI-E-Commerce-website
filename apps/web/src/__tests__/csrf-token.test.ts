import { describe, it, expect, afterEach } from 'vitest';
import { getCsrfToken } from '../lib/api';

describe('getCsrfToken', () => {
  afterEach(() => {
    document.cookie = 'csrfToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
  });

  it('returns null when no csrfToken cookie is present', () => {
    expect(getCsrfToken()).toBeNull();
  });

  it('extracts the token when present among other cookies', () => {
    document.cookie = 'other=value';
    document.cookie = 'csrfToken=abc123';
    expect(getCsrfToken()).toBe('abc123');
  });

  it('URL-decodes the token value', () => {
    document.cookie = `csrfToken=${encodeURIComponent('abc+def/123')}`;
    expect(getCsrfToken()).toBe('abc+def/123');
  });

  it('does not match a cookie whose name merely contains csrfToken as a substring', () => {
    document.cookie = 'notcsrfToken=wrong';
    expect(getCsrfToken()).toBeNull();
  });
});
