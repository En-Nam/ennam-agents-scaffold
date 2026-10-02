# Spike A — showreel v0 (preserved, not shipped)

Throwaway prototype of the 15 s Én Nam Scaffold film, kept as the reference for the `/showreel`
add-on (v1.16). See Serena `mem:decisions/showreel-addon-v1.16` (D14) and the M0 results in
`mem:comms/active/cto-small-eye-to-dev-big-head-showreel`.

- Outside the npm package (`packages/cli` only ships `dist` + `templates`). Not linted, not tested.
- Rendered output (`build/`, MP4, WAV) and `node_modules/` are intentionally not committed.
- `rig/` paths are hard-coded to the author's machine; it is a record, not a tool.
- `m0-bench/` is the M0 measurement record (bench harness + raw JSONL + logs) that set the render
  policy: GPU S=6 final / S=1 draft, no parallelism in v1, JPEG q0.97 capture, and the canvas-role
  factory rule (spike s5's blur sprite caches on GPU-backed canvases caused hash instability).

Run (author's machine only): `cd rig && npm ci && node render.mjs video ../build/out.mp4`.
