/** 日替わりの条件ごとに balance-lab を回し、先手勝率と性格の勝率の幅を表にする常設ツール。
 *
 *   npx tsx scripts/audit-daily.ts            # 採用中の条件、各 100 試合/組
 *   npx tsx scripts/audit-daily.ts 150 extra  # 不採用の候補も測る
 *
 * 合格は先手勝率 45〜55%。外れた条件は src/meta/daily.ts の DAILY_RULES から外す。
 * 既定値（balance.ts）や CPU を変えたら測り直す。 */
import { spawn } from 'node:child_process';

import { DEFAULT_BALANCE, type Balance } from '../src/game/balance';
import { DAILY_RULES } from '../src/meta/daily';

const games = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 100);
const withExtra = process.argv.includes('extra');

interface Candidate {
  id: string;
  label: string;
  patch: Partial<Balance>;
}

/** 測ったが採用していない候補（理由は journal）。 */
const EXTRA: Candidate[] = [
  { id: 'shortGame', label: '各 16 ターン', patch: { maxTurnsPerPlayer: DEFAULT_BALANCE.maxTurnsPerPlayer - 4 } },
  { id: 'toll2', label: '城塞の通行料 2 倍', patch: { fortressToll: DEFAULT_BALANCE.fortressToll * 2 } },
  { id: 'taxman', label: '徴税官 +3', patch: { taxmanAmount: DEFAULT_BALANCE.taxmanAmount + 3 } },
];

const candidates: Candidate[] = [
  { id: 'none', label: '（条件なし）', patch: {} },
  ...DAILY_RULES.map((r) => ({ id: r.id, label: r.label(DEFAULT_BALANCE), patch: r.patch(DEFAULT_BALANCE) })),
  ...(withExtra ? EXTRA : []),
];

function run(c: Candidate): Promise<{ first: number; spread: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/balance-lab.ts', String(games)], {
      env: { ...process.env, BALANCE: JSON.stringify(c.patch) },
    });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (out += d.toString()));
    child.on('close', () => {
      const first = /\| 先手勝率 \| ([\d.]+)% \|/.exec(out);
      const spread = /総合勝率 45〜55% \| ([^|]+) \|/.exec(out);
      if (!first) return reject(new Error(`${c.id}: ${out.slice(-400)}`));
      resolve({ first: Number(first[1]), spread: spread?.[1]?.trim() ?? '?' });
    });
  });
}

const PARALLEL = 4;
const results = new Map<string, { first: number; spread: string }>();
const queue = [...candidates];
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) results.set(c.id, await run(c));
  }),
);

console.log(`各 ${games} 試合/組 × 6 組`);
console.log('');
console.log('| 条件 | 先手勝率 | 性格の総合勝率 | 判定 |');
console.log('|---|---|---|---|');
for (const c of candidates) {
  const r = results.get(c.id)!;
  const ok = r.first >= 45 && r.first <= 55;
  console.log(`| ${c.label} | ${r.first.toFixed(1)}% | ${r.spread} | ${ok ? '採用可' : '外す'} |`);
}
