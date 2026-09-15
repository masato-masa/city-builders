import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('設定（効果音・振動の入切）', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('既定はどちらも「入」', async () => {
    const { isSoundEnabled, isHapticsEnabled } = await import('@/ui/settings');
    expect(isSoundEnabled()).toBe(true);
    expect(isHapticsEnabled()).toBe(true);
  });

  it('切ると localStorage に保存され、読み直しても切れたまま', async () => {
    const mod1 = await import('@/ui/settings');
    mod1.setSoundEnabled(false);
    mod1.setHapticsEnabled(false);

    vi.resetModules();
    const mod2 = await import('@/ui/settings');
    expect(mod2.isSoundEnabled()).toBe(false);
    expect(mod2.isHapticsEnabled()).toBe(false);
  });

  it('入り切りは独立している', async () => {
    const { isSoundEnabled, isHapticsEnabled, setSoundEnabled } = await import('@/ui/settings');
    setSoundEnabled(false);
    expect(isSoundEnabled()).toBe(false);
    expect(isHapticsEnabled()).toBe(true);
  });

  it('キーは city-builders: で始まる', async () => {
    const { setSoundEnabled, setHapticsEnabled } = await import('@/ui/settings');
    setSoundEnabled(false);
    setHapticsEnabled(false);
    expect(localStorage.getItem('city-builders:sound')).not.toBeNull();
    expect(localStorage.getItem('city-builders:haptics')).not.toBeNull();
  });
});
