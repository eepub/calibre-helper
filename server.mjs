// eEPUB用 ローカルCalibre連携ヘルパー(試作)
//
// Mac/Windowsにインストール済みのCalibre(ebook-convert)を、ブラウザ(eEPUB本体)から
// http://127.0.0.1:PORT 経由で呼び出せるようにする常駐サーバー。
//
// 起動: npm start (または node server.mjs)

import express from 'express';
import multer from 'multer';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { detectCalibre } from './calibreDetect.mjs';

const PORT = Number(process.env.PORT) || 47821;

// このヘルパーへのアクセスを許可するオリジン。
// 本番のeEPUBドメインと、ローカル開発用のオリジンをデフォルトで許可。
// 追加したい場合は環境変数 ALLOWED_ORIGINS(カンマ区切り)で上書き可能。
const DEFAULT_ALLOWED_ORIGINS = [
  'https://eepub.jp',
  'https://www.eepub.jp',
];
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : DEFAULT_ALLOWED_ORIGINS;

function isOriginAllowed(origin) {
  if (!origin) return true; // curlなどブラウザ以外からのアクセス
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    // ローカル開発(vite dev serverなど)は常に許可
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && protocol === 'http:') return true;
  } catch {
    // ignore
  }
  return false;
}

const app = express();

// --- CORS + Private Network Access対応 ---
// ChromeはHTTPSページからhttp://127.0.0.1等の非公開アドレスへfetchする際、
// プリフライトに Access-Control-Allow-Private-Network: true が無いとブロックする。
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(isOriginAllowed(origin) ? 204 : 403);
    return;
  }
  if (origin && !isOriginAllowed(origin)) {
    res.status(403).json({ ok: false, error: `origin not allowed: ${origin}` });
    return;
  }
  next();
});

app.get('/', (_req, res) => {
  res.type('text/plain').send('eEPUB calibre-helper (試作) が起動中です。GET /health を参照してください。');
});

app.get('/health', async (_req, res) => {
  const info = await detectCalibre();
  res.json({ ok: true, ...info, platform: process.platform });
});

// アップロードは一旦メモリに載せてから、変換用の一時ディレクトリへ書き出す。
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB(試作なので余裕を持たせる)
});

const CONVERT_TIMEOUT_MS = 5 * 60 * 1000; // 5分

app.post('/convert', upload.single('file'), async (req, res) => {
  const info = await detectCalibre();
  if (!info.found) {
    res.status(503).json({ ok: false, error: 'Calibre(ebook-convert)が見つかりませんでした。インストールされているか確認してください。' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ ok: false, error: 'file フィールドが必要です(multipart/form-data)。' });
    return;
  }

  const targetFormat = (req.body?.to || 'epub').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'epub';

  // 元のファイル名から拡張子だけ拝借(中身の判定はCalibre任せ)。パストラバーサル対策で basename のみ使用。
  const originalExt = path.extname(path.basename(req.file.originalname || '')) || '';
  // .kfx-zip のようにハイフンを含む拡張子もあるため許容する
  const safeExt = /^\.[a-z0-9][a-z0-9-]{0,15}$/i.test(originalExt) ? originalExt : '';

  let workDir;
  try {
    workDir = await mkdtemp(path.join(tmpdir(), 'eepub-calibre-'));
    const inputPath = path.join(workDir, `input${safeExt}`);
    const outputPath = path.join(workDir, `output.${targetFormat}`);

    await import('node:fs/promises').then(({ writeFile }) => writeFile(inputPath, req.file.buffer));

    await new Promise((resolve, reject) => {
      const child = execFile(
        info.ebookConvertPath,
        [inputPath, outputPath],
        { timeout: CONVERT_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            reject(Object.assign(err, { stdout, stderr }));
          } else {
            resolve({ stdout, stderr });
          }
        }
      );
      // ebook-convertは長時間の変換で進捗をstdoutに出し続けることがあるため、
      // ここでは特にログしない(試作段階)。必要ならchild.stdout.on('data', ...)でストリーム可。
      void child;
    });

    const files = await readdir(workDir);
    const outputName = files.find((f) => f.startsWith('output.'));
    if (!outputName) {
      throw new Error('変換後のファイルが見つかりませんでした。');
    }

    res.download(path.join(workDir, outputName), `converted.${targetFormat}`, async (sendErr) => {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
      if (sendErr) console.error('[calibre-helper] レスポンス送信エラー:', sendErr);
    });
    return;
  } catch (err) {
    console.error('[calibre-helper] 変換エラー:', err);
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
    res.status(500).json({
      ok: false,
      error: '変換に失敗しました。',
      detail: String(err?.stderr || err?.message || err).slice(0, 2000),
    });
  }
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[calibre-helper] listening on http://127.0.0.1:${PORT}`);
  console.log(`[calibre-helper] allowed origins: ${ALLOWED_ORIGINS.join(', ')} (+ localhost)`);
  detectCalibre().then((info) => {
    if (info.found) {
      console.log(`[calibre-helper] Calibre検出: ${info.ebookConvertPath} (v${info.version ?? '不明'}, ${info.source})`);
    } else {
      console.warn('[calibre-helper] Calibreが見つかりませんでした。ebook-convertをPATHに追加するか、既定のインストール先を確認してください。');
    }
  });
});

// ポート使用中(二重起動、または最小化した前回のウィンドウが残っている等)を、
// Node標準の生のスタックトレースではなく分かりやすいメッセージにする
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error(`[calibre-helper] ポート${PORT}は既に使用中です。`);
    console.error('[calibre-helper] おそらく既にこのヘルパーが起動しています(二重起動は不要です)。');
    console.error(`[calibre-helper] 確認方法: ブラウザで http://127.0.0.1:${PORT}/health を開いてください。`);
    console.error('[calibre-helper] 他のウィンドウが見当たらない場合は、タスクマネージャーでnode.exeを終了してから、もう一度お試しください。');
    console.error('');
    process.exit(0);
  } else {
    console.error('[calibre-helper] 起動エラー:', err);
    process.exit(1);
  }
});
