import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

// Common per-OS install locations (fallback candidates when PATH doesn't have it)
function candidatePaths() {
  const candidates = [];
  if (isWindows) {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env['LOCALAPPDATA'] || '';
    candidates.push(
      path.join(pf, 'Calibre2', 'ebook-convert.exe'),
      path.join(pf86, 'Calibre2', 'ebook-convert.exe'),
    );
    if (localAppData) {
      candidates.push(path.join(localAppData, 'Programs', 'calibre', 'ebook-convert.exe'));
    }
  } else if (isMac) {
    candidates.push(
      '/Applications/calibre.app/Contents/MacOS/ebook-convert',
      path.join(process.env.HOME || '', 'Applications/calibre.app/Contents/MacOS/ebook-convert'),
      '/opt/homebrew/bin/ebook-convert', // Homebrew cask (Apple Silicon)
      '/usr/local/bin/ebook-convert', // Homebrew cask (Intel)
    );
  } else {
    // Linux (not an official target, but let it work if it happens to)
    candidates.push('/usr/bin/ebook-convert', '/opt/calibre/ebook-convert');
  }
  return candidates;
}

function siblingCalibredb(ebookConvertPath) {
  const dir = path.dirname(ebookConvertPath);
  const name = isWindows ? 'calibredb.exe' : 'calibredb';
  return path.join(dir, name);
}

async function findOnPath() {
  try {
    const cmd = isWindows ? 'where' : 'which';
    const { stdout } = await execFileAsync(cmd, ['ebook-convert']);
    const first = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
    return first || null;
  } catch {
    return null;
  }
}

async function getVersion(ebookConvertPath) {
  try {
    const { stdout } = await execFileAsync(ebookConvertPath, ['--version']);
    // e.g. "ebook-convert (calibre 7.14)"
    const match = stdout.match(/calibre\s+([\d.]+)/i);
    return match ? match[1] : stdout.trim().split('\n')[0];
  } catch {
    return null;
  }
}

/**
 * Detect a Calibre installation.
 * @returns {Promise<{found: boolean, ebookConvertPath: string|null, calibredbPath: string|null, version: string|null, source: string|null}>}
 */
export async function detectCalibre() {
  let ebookConvertPath = await findOnPath();
  let source = ebookConvertPath ? 'PATH' : null;

  if (!ebookConvertPath) {
    for (const candidate of candidatePaths()) {
      if (existsSync(candidate)) {
        ebookConvertPath = candidate;
        source = 'known-install-location';
        break;
      }
    }
  }

  if (!ebookConvertPath) {
    return { found: false, ebookConvertPath: null, calibredbPath: null, version: null, source: null };
  }

  const calibredbPath = siblingCalibredb(ebookConvertPath);
  const version = await getVersion(ebookConvertPath);

  return {
    found: true,
    ebookConvertPath,
    calibredbPath: existsSync(calibredbPath) ? calibredbPath : null,
    version,
    source,
  };
}
