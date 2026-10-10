/** 計測ツール共通: 環境変数 BALANCE の JSON で DEFAULT_BALANCE を上書きする口。
 *  ソースを書き換えずに数値を振った結果を比べるためのもの。
 *  オブジェクトの項目（cards・buildings・upgrades・level2 など）は 2 段深くまで重ねるので、
 *  BALANCE='{"level2":{"tradingHouseIncome":3}}' のように変えたい値だけ書けばよい。 */
import { DEFAULT_BALANCE, type Balance } from '../src/game/balance';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

export function balanceFromEnv(): Balance {
  const override = JSON.parse(process.env.BALANCE ?? '{}') as Obj;
  const base = DEFAULT_BALANCE as unknown as Obj;
  const out: Obj = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const cur = base[key];
    if (isObj(value) && isObj(cur)) {
      const merged: Obj = { ...cur };
      for (const [k, v] of Object.entries(value)) {
        const c = cur[k];
        merged[k] = isObj(v) && isObj(c) ? { ...c, ...v } : v;
      }
      out[key] = merged;
    } else {
      out[key] = value;
    }
  }
  return out as unknown as Balance;
}
