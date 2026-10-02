---
name: showreel
description: Use WHEN the user asks for a showreel, promo film, demo reel or launch video of THIS repo — `/showreel [15|30|45|60]` (default 30 s). Delegates to the motion-designer agent, which renders showreel/<slug>-<N>s.mp4 from code-extracted facts with the showreel toolkit. Requires showreel toolkit 1.0.0.
---

# /showreel [15|30|45|60]

Makes a 1920x1080@60 H.264 + AAC film of **this** repo, exactly 15, 30, 45 or 60 s (default **30**). Every on-screen string comes from facts the toolkit extracts from the code, README, manifests and Serena — nothing is written by the model.

**Required toolkit version: 1.0.0** (`node .claude/showreel/cli.mjs version`). The agent passes `--expect 1.0.0` to preflight; a mismatch fails with `E_VERSION` and the exact re-run command. The skill, the motion-designer agent and `.claude/showreel/` upgrade together.

## When to use

- The user wants a short promo / demo film of this codebase.
- Not for doc-first repos (hr, accounting, ba, …): the toolkit refuses with `E_THIN_REPO` and lists the missing fact kinds. That refusal is the correct outcome — report it, do not work around it.

## Tell the user before starting (cost / time)

- **First run** downloads ~111 MB (measured: puppeteer-core, an ffmpeg build, two fonts) into `.claude/showreel/.tool/` with `npm ci`. Needs Node >= 22.12 and Chrome or Edge installed. Not counted in the film time.
- **Rendering** the final film takes minutes (longer for 45/60 s; longer again on a machine with no GPU, where motion blur is reduced). Each QA round renders a draft contact sheet.
- The agent runs 3–5 QA rounds on your Anthropic account; it reports the tokens it used.

## Do

1. Parse the duration: `15`, `30`, `45` or `60`; no argument → `30`. Anything else → ask the user to pick one of the four. Do not guess.
2. Give the cost/time note above in one or two lines.
3. Delegate to the **motion-designer** agent with the duration. It follows its fixed procedure (preflight → facts → storyboard → 3–5 QA rounds → transition critic → render --final → verify) and returns the report. If you cannot start a subagent (for example a headless run without the Agent tool), Read `.claude/agents/motion-designer.md` and follow its procedure yourself, word for word — same steps, same boundaries, same report — and say in the report that it ran inline.
4. Relay the agent's report to the user unchanged in substance: film path, QA rounds n/5, critic findings, verify JSON, measured timings, tokens, any GPU notice, the cluster disclosure if present, and anything skipped.

Never edit `.claude/showreel/**`, app code or `showreel/facts.json` to make a film pass. Runbook: `docs/agents-scaffold/showreel.md`.
