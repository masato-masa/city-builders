import { describe, expect, it } from 'vitest';

import { exposedVpOf, reachOf } from '@/ai/evaluate';
import { DEFAULT_BALANCE, type Balance } from '@/game/balance';
import { reduce } from '@/game/reducer';
import { districtOfSlot, scoreOf, titleHolder, titleVpSwing, vpOfSlot } from '@/game/selectors';
import { createGame } from '@/game/setup';
import type { GameState } from '@/game/types';

const B = DEFAULT_BALANCE;
/** 商人街（地区 0）の区画。0・1 は商館、2 は石切場 */
const [S0, S1, S2] = B.districts[0]!.slots as [number, number, number];

/** you の手番から始まる局面。手札は称号に関係しないカードだけにする。 */
function fixture(youCoins = 100, cpuCoins = 100): GameState {
  const g = createGame(1);
  g.current = 'you';
  g.turn = 3;
  g.players.you.coins = youCoins;
  g.players.cpu.coins = cpuCoins;
  g.players.you.hand = ['miner', 'banker', 'usurer', 'blockader'];
  g.players.cpu.hand = ['miner', 'banker', 'usurer', 'blockader'];
  return g;
}

const pass = (g: GameState, b: Balance = B) => reduce(g, { type: 'endTurn' }, b);
const build = (g: GameState, slotId: number, b: Balance = B) => reduce(g, { type: 'build', slotId }, b);

describe('地区の称号', () => {
  it('地区は 10 区画を重なりなく覆う', () => {
    const all = B.districts.flatMap((d) => d.slots).sort((a, b) => a - b);
    expect(all).toEqual(B.market.map((_, i) => i));
    expect(createGame(1).titles).toEqual(B.districts.map(() => null));
  });

  it('最初は誰も持たず、地区で 1 件目を建てた側が称号を取る', () => {
    let g = fixture();
    expect(titleHolder(g, 0)).toBeNull();
    g = build(g, S0);
    expect(titleHolder(g, 0)).toBe('you');
    expect(titleHolder(g, 1)).toBeNull();
  });

  it('称号の VP が scoreOf に入る', () => {
    let g = fixture();
    g = build(g, S0);
    const buildings = vpOfSlot(g, g.market[S0]!, B);
    expect(scoreOf(g, 'you')).toBe(buildings + B.districtTitleVp);
    expect(scoreOf(g, 'cpu')).toBe(0);
  });

  it('同数になったら今の持ち主が保持し、相手が上回ったら移る', () => {
    let g = fixture();
    g = build(g, S0);
    g = pass(g);
    g = build(g, S1);
    // 1 対 1 は同数: 先に取った you のまま
    expect(titleHolder(g, 0)).toBe('you');
    g = pass(g);
    g = pass(g);
    g = build(g, S2);
    // cpu が 2 対 1 で上回る
    expect(titleHolder(g, 0)).toBe('cpu');
    expect(scoreOf(g, 'cpu')).toBe(
      vpOfSlot(g, g.market[S1]!, B) + vpOfSlot(g, g.market[S2]!, B) + B.districtTitleVp,
    );
  });

  it('買収で物件が動くと称号も動く', () => {
    let g = fixture();
    g = build(g, S0);
    g = pass(g);
    expect(titleHolder(g, 0)).toBe('you');
    g = reduce(g, { type: 'acquire', slotId: S0 }, B);
    expect(g.market[S0]!.owner).toBe('cpu');
    expect(titleHolder(g, 0)).toBe('cpu');
    expect(scoreOf(g, 'you')).toBe(0);
  });

  it('封鎖者で止められた物件は、既定では称号の件数に数える（VP と同じく止まらない）', () => {
    let g = fixture();
    g = build(g, S0);
    g = pass(g);
    g = reduce(g, { type: 'useCard', card: 'blockader', blockadeSlot: S0 }, B);
    expect(g.players.you.disabledSlot).toBe(S0);
    expect(titleHolder(g, 0)).toBe('you');
  });

  it('数えない設定なら、止められた物件の分だけ件数が減る（同数なら保持）', () => {
    const NO_DISABLED: Balance = { ...B, districtCountsDisabled: false };
    let g = fixture();
    g = build(g, S0, NO_DISABLED);
    g = pass(g, NO_DISABLED);
    g = build(g, S1, NO_DISABLED);
    // 1 対 1 で you が保持
    expect(titleHolder(g, 0)).toBe('you');
    g = reduce(g, { type: 'useCard', card: 'blockader', blockadeSlot: S0 }, NO_DISABLED);
    // you の 1 件が止まり 0 対 1 → cpu へ
    expect(titleHolder(g, 0)).toBe('cpu');
  });
});

describe('CPU の評価: 称号', () => {
  it('titleVpSwing は「あと 1 件で取れる / 奪われる」を VP で返す', () => {
    let g = fixture();
    g = build(g, S0);
    // cpu が S1 を建てても 1 対 1 で同数 → 動かない
    expect(titleVpSwing(g, S1, 'cpu', 'cpu', B)).toBe(0);
    // cpu が you の S0 を買収すれば 0 対 1 → cpu が取り、you が失う
    expect(titleVpSwing(g, S0, 'cpu', 'cpu', B)).toBe(B.districtTitleVp);
    expect(titleVpSwing(g, S0, 'cpu', 'you', B)).toBe(-B.districtTitleVp);
    expect(districtOfSlot(S0, B)).toBe(0);
  });

  it('reach は建てて称号が取れる分を含む', () => {
    const g = fixture(B.buildings.tradingHouse.cost, 0);
    expect(reachOf(g, 'you', B)).toBe(B.buildings.tradingHouse.vp + B.districtTitleVp);
    expect(reachOf(g, 'you', { ...B, districtTitleVp: 0 })).toBe(B.buildings.tradingHouse.vp);
  });

  it('exposed は奪われると称号も失う分を含む', () => {
    let g = fixture();
    g = build(g, S0);
    g = pass(g);
    g = reduce(g, { type: 'startTurn' }, B);
    g = pass(g);
    // you の手番。cpu は次の手番で S0 を買収できる額を持っている
    g.players.cpu.coins = 100;
    const vp = vpOfSlot(g, g.market[S0]!, B);
    expect(exposedVpOf(g, 'you', B)).toBe(vp + B.districtTitleVp);
    expect(exposedVpOf(g, 'you', { ...B, districtTitleVp: 0 })).toBe(vp);
  });
});
