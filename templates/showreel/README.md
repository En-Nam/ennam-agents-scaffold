# showreel add-on

Toolkit version: 1.0.0

Ennam Agents Scaffold — `/showreel` toolkit (v1.16.0). Installs into your project as `docs/agents-scaffold/showreel.md`.

Scope: render a 15–60 s promo film of **this** repo (1920x1080@60, H.264 + AAC) from facts extracted by code. Every on-screen string comes from a code-extracted fact or a fixed phrase library — the storyboard holds only enums, numbers, fact ids and phrase ids. **Opt-in**: nothing in your role's setup changes (same CLAUDE.md, AGENTS.md, workflow preset and settings); the add-on only adds the files below.

Install it on top of any code role:

```bash
npx @ennamjsc/agents-scaffold next showreel     # or: python showreel, dotnet-mvc showreel, …
```

## What ships

- `.claude/showreel/` — the toolkit (plain Node ESM, text only). Run it with `node .claude/showreel/cli.mjs <command>`; every command prints one JSON line (`{"ok":true,…}` or `{"ok":false,"error":{code,message,fix}}`, exit 1).
- `.claude/showreel/deps/` — the dependency manifest (`manifest.json`) and its npm lockfile (`lock.json`).

Upgrades: the whole `.claude/showreel/` tree is upgraded together (the scaffold asks before overwriting a changed file; `--merge-strategy=overwrite` replaces it).

## Requirements

- **Node >= 22.12** for the toolkit (the scaffold itself needs Node >= 20). Older Node gets an `E_NODE` error with the fix.
- **Google Chrome or Microsoft Edge** installed, or `SHOWREEL_BROWSER=/path/to/chrome`.
- **First run downloads ~200 MB** (puppeteer-core driver libs, an ffmpeg build, two fonts) into `.claude/showreel/.tool/` with `npm ci`. Behind a proxy set `HTTPS_PROXY`. Your own `package.json` and `node_modules` are never touched.

```bash
node .claude/showreel/cli.mjs preflight    # installs .tool, finds the browser + ffmpeg
node .claude/showreel/cli.mjs version
```

Work files go to `showreel/` (`facts.json`, `storyboard.json`, `build/`, `<slug>-<N>s.mp4`). Preflight writes `showreel/.gitignore` (`build/`, `*.mp4`) and `.claude/showreel/.gitignore` (`.tool/`) if they are absent.

## Environment variables

| Variable | Effect |
|---|---|
| `SHOWREEL_BROWSER` | Browser executable to use (wins over detection). |
| `CHROME_PATH` | Fallback browser executable. |
| `SHOWREEL_NO_SANDBOX=1` | Adds `--no-sandbox` (CI containers). Also added automatically when running as root. |
| `SHOWREEL_TOOL_DIR` | Use another dependency dir instead of `.claude/showreel/.tool`. |
| `FFMPEG_BIN` | ffmpeg executable to use instead of the downloaded one. |

## THIRD-PARTY

Nothing third-party is bundled in this scaffold or its npm package. The dependency manifest is **`.claude/showreel/deps/`** (`manifest.json` + `lock.json`, exact pins) — point security and licence scanners at it. On first run, `npm ci` downloads into `.claude/showreel/.tool/` on your machine:

| Package | Version | Licence | Note |
|---|---|---|---|
| `puppeteer-core` | 25.12.0 | Apache-2.0 | Drives your installed Chrome/Edge; no browser is downloaded. |
| `ffmpeg-static` | 5.3.0 | GPL-3.0-or-later | Downloads a GPL ffmpeg build (with x264) for local use only. Never redistributed by the scaffold. |
| `@fontsource-variable/archivo` | 5.3.0 | OFL-1.1 | Display font. |
| `@fontsource-variable/jetbrains-mono` | 5.3.0 | OFL-1.1 | Monospace font. |

H.264 output may be subject to patent licensing depending on how you distribute the film.
