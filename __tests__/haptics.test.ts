import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('振動', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    localStorage.clear();
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it('navigator.vibrate が無い環境でも例外を投げない', async () => {
    const original = navigator.vibrate;
    // @ts-expect-error テストのため一時的に外す
    delete navigator.vibrate;
    const { hapticBuild, hapticLose, hapticReject, hapticUseCard, hapticWin } = await import(
      '@/ui/haptics'
    );
    expect(() => hapticUseCard()).not.toThrow();
    expect(() => hapticBuild()).not.toThrow();
    expect(() => hapticReject()).not.toThrow();
    expect(() => hapticWin()).not.toThrow();
    expect(() => hapticLose()).not.toThrow();
    navigator.vibrate = original;
  });

  it('対応している環境では navigator.vibrate を呼ぶ', async () => {
    const vibrate = vi.fn();
    navigator.vibrate = vibrate;
    const { hapticUseCard } = await import('@/ui/haptics');
    hapticUseCard();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('設定で振動を切ると呼ばれない', async () => {
    const vibrate = vi.fn();
    navigator.vibrate = vibrate;
    const settings = await import('@/ui/settings');
    settings.setHapticsEnabled(false);
    const { hapticBuild } = await import('@/ui/haptics');
    hapticBuild();
    expect(vibrate).not.toHaveBeenCalled();
  });
});
