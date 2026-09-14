import { DEFAULT_BALANCE, type Balance } from '@/game/balance';

const KEY = 'city-builders:balance';

/** 数値の上書き。遊びながら調整するための仕組み。
 *  壊れた値が入っていても既定値に戻せるよう、浅くマージするだけにする。 */
export function loadBalance(): Balance {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_BALANCE;
    const saved = JSON.parse(raw) as Partial<Balance>;
    return { ...DEFAULT_BALANCE, ...saved };
  } catch {
    return DEFAULT_BALANCE;
  }
}

export function saveBalance(balance: Balance): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(balance));
  } catch {
    // 保存できなくても遊べる
  }
}

export function resetBalance(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
}
