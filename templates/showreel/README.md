# showreel add-on

Toolkit version: 1.0.0

Ennam Agents Scaffold — showreel add-on: the `/showreel` skill, the motion-designer agent and the toolkit, run as `node .claude/showreel/cli.mjs <command>` (v1.16.0). Installs into your project as `docs/agents-scaffold/showreel.md`.

Scope: render a 15–60 s promo film of **this** repo (1920x1080@60, H.264 + AAC) from facts extracted by code. Every on-screen string comes from a code-extracted fact or a fixed phrase library — the storyboard holds only enums, numbers, fact ids and phrase ids. **Opt-in**: nothing in your role's setup changes (same CLAUDE.md, AGENTS.md, workflow preset and settings); the add-on only adds the files below.

Install it on top of any code role:

```bash
npx @ennamjsc/agents-scaffold next showreel     # or: python showreel, dotnet-mvc showreel, …
```

## What ships

- `.claude/skills/showreel/SKILL.md` — the `/showreel [15|30|45|60]` skill (default 30 s). It hands the job to the motion-designer agent.
- `.claude/agents/motion-designer.md` — the one agent that makes the film, with a fixed procedure (below).
- `.claude/showreel/` — the toolkit (plain Node ESM, text only). Run it with `node .claude/showreel/cli.mjs <command>`; every command prints one JSON line (`{"ok":true,…}` or `{"ok":false,"error":{code,message,fix}}`, exit 1).
- `.claude/showreel/deps/` — the dependency manifest (`manifest.json`) and its npm lockfile (`lock.json`).

Upgrades: the agent, the skill and the whole `.claude/showreel/` tree upgrade together (the scaffold asks before overwriting a changed file; `--merge-strategy=overwrite` replaces it). The agent and skill declare the toolkit version they need and pass it to `preflight --expect <version>`; a mismatch fails with `E_VERSION` and the re-run command:

```bash
npx @ennamjsc/agents-scaffold@latest <your-roles> showreel --merge-strategy=overwrite
```

## Making a film: `/showreel`

In Claude Code, run `/showreel` (30 s) or `/showreel 15|45|60`. The motion-designer agent:

1. runs `preflight --expect <version>`;
2. runs `facts`. If the repo is doc-first (no code facts), it **refuses** with `E_THIN_REPO` and lists the missing fact kinds — no film is made;
3. reads the facts digest, `archetypes/archetypes.json`, `archetypes/arrangements.json` and `phrases.json`;
4. writes `showreel/storyboard.json` (enums, fact ids, phrase ids only);
5. runs 3–5 QA rounds: `check --sheet`, looks at the contact sheet, edits the storyboard. Each round's sheet is kept as `showreel/build/sheet-r<n>.png`;
6. runs a transition critic pass;
7. runs `render --final`, then `verify`.

It never edits the toolkit, your app code or `showreel/facts.json`.

**What the agent reports:** QA rounds n/5 with sheet paths and what changed each round; the critic's findings; the `verify` JSON; measured timings; tokens (fresh and context-weighted); any "no GPU detected" notice; anything it skipped. If a flow beat had to be drawn as an unordered cluster (`flowVariantReason: "no-sequence-source"` in the `check`/`render` output), it says so: no ordered setup/usage list of 3 or more steps was found in the README, so no step order is claimed.

**Session Boot exception (provisional):** the motion-designer skips the full Serena Session Boot (the `facts` command already reads Serena in priority order). It still writes its checkpoint.

## Running the toolkit by hand

```bash
node .claude/showreel/cli.mjs preflight --expect 1.0.0
node .claude/showreel/cli.mjs facts                 # showreel/facts.json + digest (or E_THIN_REPO)
node .claude/showreel/cli.mjs check --sheet         # validate storyboard.json + draft contact sheet
node .claude/showreel/cli.mjs render --final        # or --draft; --master for crf 14
node .claude/showreel/cli.mjs verify
```

## Requirements

- **Node >= 22.12** for the toolkit (the scaffold itself needs Node >= 20). Older Node gets an `E_NODE` error with the fix.
- **Google Chrome or Microsoft Edge** installed, or `SHOWREEL_BROWSER=/path/to/chrome`.
- **First run downloads ~111 MB** (puppeteer-core, an ffmpeg build, two fonts; measured on ONE plugin-heavy Windows machine with an RTX 5070 Ti — not a typical-user number until the clean-environment run is recorded) into `.claude/showreel/.tool/` with `npm ci`. Behind a proxy set `HTTPS_PROXY`. Your own `package.json` and `node_modules` are never touched.

```bash
node .claude/showreel/cli.mjs preflight    # installs .tool, finds the browser + ffmpeg
node .claude/showreel/cli.mjs version
```

Work files go to `showreel/` (`facts.json`, `storyboard.json`, `build/`, `<slug>-<N>s.mp4`; drafts are `<slug>-<N>s-draft.mp4`). A film is moved onto that name only after `verify` passes: if verify fails, the film stays at `showreel/build/<name>.unverified.mp4`, the error says why, and your previous film is untouched — fix the cause and re-render to publish. Preflight writes `showreel/.gitignore` (`build/`, `*.mp4`) and `.claude/showreel/.gitignore` (`.tool/`) if they are absent.

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
