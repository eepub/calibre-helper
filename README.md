English | [日本語](README.ja.md)

# eEPUB Calibre Helper

A small local helper program that lets [eEPUB](https://eepub.jp) call a [Calibre](https://calibre-ebook.com/)
installation already on your Mac or Windows machine, to convert Kindle-format books (KFX / MOBI / AZW3) into EPUB.

## What does this do?

eEPUB is a browser-only app (a PWA). By design, a web page cannot launch external programs installed on your
computer, such as Calibre. Running this helper lets the eEPUB tab reach Calibre through
`http://127.0.0.1:47821` — an address that only exists on your own machine — so that KFX and other Kindle files
can be imported.

- **Nothing is sent anywhere else.** The conversion happens entirely on your own machine (this tool only
  bridges "the eEPUB tab on your machine" and "Calibre on your machine")
- **Only eepub.jp and localhost are allowed to talk to it.** No unrelated site can use it
- **The full source is in this folder** (`server.mjs` is the whole server, about 150 lines). Read it and see
  exactly what it does

## Requirements

1. **Node.js** — install from <https://nodejs.org/> (the LTS version is fine)
2. **Calibre** — install from <https://calibre-ebook.com/download>

Both are plain installers; no extra configuration is needed (PATH setup is handled by the installers).

> **Important (Windows):** put this folder somewhere with an **ASCII-only path** (e.g. `C:\calibre-helper`).
> We found that Node.js 22 on Windows crashes (segfaults) while loading `express` when the folder path
> contains non-ASCII characters (e.g. a Japanese folder name like `その他`). This is a Node.js issue, not
> something this tool can work around. Avoid placing it under a non-English folder name.

## Usage

1. Download and extract this folder
2. **Windows**: double-click `start.bat`
   **Mac**: double-click `start.command`
   (the first run takes a little longer — `npm install` runs automatically in the background)
3. A window titled "eEPUB Calibre Helper" stays open — that's the sign it's running
4. Switch back to eEPUB ([eepub.jp](https://eepub.jp)) and add a book as usual. Selecting a KFX/MOBI/AZW3 file
   automatically tries conversion through this helper
5. When you're done, just close the window to stop the helper (start it again next time you need it)

### "Cannot verify developer" on Mac

Right-click `start.command` and choose "Open" — you'll get a one-time confirmation dialog, then it runs
normally (this is only needed once, because this distribution isn't notarized by Apple).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Node.js was not found" | Install it from [nodejs.org](https://nodejs.org/) |
| eEPUB still shows KFX as "not supported" | Make sure the helper is actually running. While it's up, open `http://127.0.0.1:47821/health` in a browser to check its status |
| Conversion "failed" | Your Calibre install may not support that file's format or DRM. **This helper never removes DRM itself** — the result depends entirely on your own Calibre setup |
| "Port 47821 already in use" | Something else is using that port. Change the `PORT` constant at the top of `calibre-helper/server.mjs`, or set the `PORT` environment variable before starting |
| Window closes instantly with no error at all | The folder path likely contains non-ASCII characters (e.g. Japanese). Move the folder to an ASCII-only path such as `C:\calibre-helper` and try again |

## A note on DRM

This tool is a thin wrapper around Calibre's `ebook-convert` command — it does not implement any DRM removal
itself. If your own Calibre installation happens to be able to strip DRM (for example, because you've installed
some plugin for it), conversion may succeed as a side effect, but that capability comes from your Calibre setup,
not from this tool. Please only use this for private format-shifting of books you have a legitimate right to.
