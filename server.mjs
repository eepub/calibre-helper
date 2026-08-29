// Local Calibre helper for eEPUB
//
// A small local server that lets your browser (eEPUB) call a Calibre
// installation (ebook-convert) already on your Mac/Windows machine,
// via http://127.0.0.1:PORT.
//
// Start: npm start (or node server.mjs)

import express from 'express';
import multer from 'multer';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { detectCalibre } from './calibreDetect.mjs';

const PORT = Number(process.env.PORT) || 47821;

// Origins allowed to talk to this helper.
// Defaults to the production eEPUB domain plus local dev origins.
// Override with the ALLOWED_ORIGINS env var (comma-separated) if needed.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://eepub.jp',
  'https://www.eepub.jp',
];
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : DEFAULT_ALLOWED_ORIGINS;

function isOriginAllowed(origin) {
  if (!origin) return true; // non-browser clients (curl, etc.)
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    // always allow local dev (vite dev server, etc.)
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && protocol === 'http:') return true;
  } catch {
    // ignore
  }
  return false;
}

const app = express();

// --- CORS + Private Network Access ---
// Chrome requires Access-Control-Allow-Private-Network: true on the
// preflight response when an HTTPS page fetches a non-public address
// like http://127.0.0.1, or it blocks the request.
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
  res.type('text/plain').send('eEPUB calibre-helper is running. See GET /health.');
});

app.get('/health', async (_req, res) => {
  const info = await detectCalibre();
  res.json({ ok: true, ...info, platform: process.platform });
});

// Uploads are buffered in memory first, then written out to a temp
// directory for conversion.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB, generous on purpose
});

const CONVERT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

app.post('/convert', upload.single('file'), async (req, res) => {
  const info = await detectCalibre();
  if (!info.found) {
    res.status(503).json({ ok: false, error: 'Calibre (ebook-convert) was not found. Please make sure it is installed.' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ ok: false, error: 'A "file" field is required (multipart/form-data).' });
    return;
  }

  const targetFormat = (req.body?.to || 'epub').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'epub';

  // Borrow just the extension from the original filename (Calibre figures
  // out the actual format). basename-only as a path traversal guard.
  const originalExt = path.extname(path.basename(req.file.originalname || '')) || '';
  // allow hyphenated extensions like .kfx-zip
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
      // ebook-convert can keep printing progress to stdout during long
      // conversions; not logged here for now. Stream via
      // child.stdout.on('data', ...) if that's ever needed.
      void child;
    });

    const files = await readdir(workDir);
    const outputName = files.find((f) => f.startsWith('output.'));
    if (!outputName) {
      throw new Error('Could not find the converted output file.');
    }

    res.download(path.join(workDir, outputName), `converted.${targetFormat}`, async (sendErr) => {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
      if (sendErr) console.error('[calibre-helper] error sending response:', sendErr);
    });
    return;
  } catch (err) {
    console.error('[calibre-helper] conversion error:', err);
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
    res.status(500).json({
      ok: false,
      error: 'Conversion failed.',
      detail: String(err?.stderr || err?.message || err).slice(0, 2000),
    });
  }
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[calibre-helper] listening on http://127.0.0.1:${PORT}`);
  console.log(`[calibre-helper] allowed origins: ${ALLOWED_ORIGINS.join(', ')} (+ localhost)`);
  detectCalibre().then((info) => {
    if (info.found) {
      console.log(`[calibre-helper] Calibre detected: ${info.ebookConvertPath} (v${info.version ?? 'unknown'}, ${info.source})`);
    } else {
      console.warn('[calibre-helper] Calibre was not found. Add ebook-convert to your PATH, or check your install location.');
    }
  });
});

// Turn a busy port (double launch, or a previous minimized window still
// running) into a clear message instead of Node's raw stack trace.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error(`[calibre-helper] Port ${PORT} is already in use.`);
    console.error('[calibre-helper] This helper is probably already running (no need to start it twice).');
    console.error(`[calibre-helper] To check: open http://127.0.0.1:${PORT}/health in a browser.`);
    console.error('[calibre-helper] If you can\'t find another window, quit node.exe in Task Manager and try again.');
    console.error('');
    process.exit(0);
  } else {
    console.error('[calibre-helper] startup error:', err);
    process.exit(1);
  }
});
