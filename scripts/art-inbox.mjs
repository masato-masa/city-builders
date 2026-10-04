// 生成した素材をブラウザから直接受け取るための小さな受け口。常設。
//
//   node scripts/art-inbox.mjs
//
// ブラウザの「ダウンロード」経由で素材を取り込もうとすると、Chrome の
// 「複数の自動ダウンロード」制限で 2 枚目以降が無言で失敗する。
// 素材は今後 15 枚以上取り込むので、毎回そこで止まらないように受け口を用意する。
//
// ページ側からはこう送る（https のページからでも、localhost は
// 安全なオリジンとして扱われるため mixed content で止まらない）:
//
//   await fetch('http://localhost:5199/save?name=quarry-trial.png', {
//     method: 'POST',
//     body: blob,
//   });

import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const PORT = Number(process.env.PORT ?? 5199);
// INBOX_DIR で保存先を変えられる（効果音の候補は INBOX_DIR=refs/sfx）
const ROOT = resolve(process.env.INBOX_DIR ?? 'refs/art');

/** 受け取ったファイル名を refs/art/ の中へ閉じ込める。 */
function safePath(name) {
  const cleaned = String(name || '').replace(/[^A-Za-z0-9._-]/g, '');
  if (!cleaned || cleaned.startsWith('.')) return null;
  const full = join(ROOT, cleaned);
  return full.startsWith(ROOT) ? full : null;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (req.method !== 'POST' || url.pathname !== '/save') {
    res.writeHead(404, CORS);
    res.end('not found');
    return;
  }

  const path = safePath(url.searchParams.get('name'));
  if (!path) {
    res.writeHead(400, CORS);
    res.end('bad name');
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  console.log(`受け取り: ${path} (${(body.length / 1024).toFixed(1)}KB)`);

  res.writeHead(200, { ...CORS, 'Content-Type': 'text/plain' });
  res.end(String(body.length));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`素材の受け口: http://localhost:${PORT}/save?name=<ファイル名>`);
  console.log(`保存先: ${ROOT}`);
});
