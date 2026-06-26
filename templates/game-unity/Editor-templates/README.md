# Editor-templates

Two C# scripts that the user must copy into `Assets/Editor/` of their Unity project. Not auto-installed because the scaffold cannot reach inside Unity's asset database.

## Install

```bash
mkdir -p Assets/Editor
cp Editor-templates/EnnamPreflight.cs Assets/Editor/
cp Editor-templates/EnnamPerf.cs Assets/Editor/
```

Open Unity once after copying. Both should compile cleanly.

## What they do

### `EnnamPreflight.cs`

Auto-runs on every Unity Editor open (`[InitializeOnLoad]`) + menu entry `Tools → Ennam → Run Preflight`. Asserts:

1. **Domain Reload disabled** — required for Unity MCP bridge stability
2. **URP asset HDR off + MSAA ≤ 2x** — mobile perf compliance (CLAUDE.md rule #3)
3. **Cinemachine 3.x** — warns on 2.x without `--legacy` mode

Violations are logged as Unity Console errors. The `unity-mcp-setup` skill reads them via `mcp__unity__read_console`.

### `EnnamPerf.cs`

Playmode harness for the `perf-budget-check` skill. Invoked via:

```bash
"$UNITY" -batchmode -nographics -projectPath . -executeMethod EnnamPerf.RunBudgetCheck -quit
```

Loads each scene from `docs/perf-budget.md` `bench_scenes:`, enters Play Mode, samples ProfilerRecorder for draw calls / SetPass / triangles / texture memory. Writes `.ennam/perf/last-run.json` + exits 0/1/2 (PASS/WARN/FAIL).

Menu entry `Tools → Ennam → Perf Self-Test` does a `Debug.Log` smoke check that the script compiled.

## Caveats

- `EnnamPerf.cs` uses `Thread.Sleep` to wait ~300 frames in PlayMode — a real implementation should use `EditorCoroutines` or a PlayMode test harness. The template is intentionally dep-free.
- The YAML-ish reader in `EnnamPerf.cs` is naive (no `YamlDotNet` dep). It handles the keys defined in `docs/perf-budget.md` and nothing else.
- `EnnamPreflight.cs` uses reflection to read URP asset properties so it does not take a hard compile-time dependency on `com.unity.render-pipelines.universal` — works across URP 14/17.

## Why not auto-install into Assets/Editor/

The scaffold runs from your Unity project root and emits dotfiles + docs. It does NOT write into `Assets/` because Unity's asset import pipeline locks files during refresh — touching `Assets/Editor/` mid-scaffold-run can leave Unity in an inconsistent state. Copy is one command + you see what landed where.
