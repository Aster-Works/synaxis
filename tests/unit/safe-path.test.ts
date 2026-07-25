import { describe, it, expect } from 'vitest';
import { safeInternalPath } from '@/app/lib/safe-path';

describe('safeInternalPath（オープンリダイレクト対策）', () => {
  it('アプリ内パスはそのまま通す', () => {
    expect(safeInternalPath('/check-in', '/x')).toBe('/check-in');
    expect(safeInternalPath('/check-in?event=abc', '/x')).toBe('/check-in?event=abc');
  });

  it('外部URL・プロトコル相対・userinfoトリックは fallback に落とす', () => {
    expect(safeInternalPath('https://evil.com', '/check-in')).toBe('/check-in');
    expect(safeInternalPath('//evil.com', '/check-in')).toBe('/check-in');
    expect(safeInternalPath('/\\evil.com', '/check-in')).toBe('/check-in');
    expect(safeInternalPath('@evil.com', '/check-in')).toBe('/check-in');
    expect(safeInternalPath('.evil.com/path', '/check-in')).toBe('/check-in');
  });

  it('null / 空は fallback', () => {
    expect(safeInternalPath(null, '/check-in')).toBe('/check-in');
    expect(safeInternalPath(undefined, '/check-in')).toBe('/check-in');
    expect(safeInternalPath('', '/check-in')).toBe('/check-in');
  });
});
