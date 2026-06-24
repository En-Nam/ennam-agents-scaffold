---
name: react-19-suspense-boundaries
description: Use when adding a data fetch, an async route, a lazy-loaded component, or anything that reads a Promise via `use()` / `useSuspenseQuery` — to place Suspense + Error Boundary pairs correctly and avoid full-page fallbacks.
---

# React 19 Suspense Boundaries

Suspense and Error Boundaries are a pair. Every async region needs both, scoped to the smallest area that can independently load and fail.

## The rule

For each volatile region (a route, a data-bound card, a lazy chart):

```
<ErrorBoundary fallback={<RegionError />}>
  <Suspense fallback={<RegionSkeleton />}>
    <RegionThatReadsAPromise />
  </Suspense>
</ErrorBoundary>
```

The Error Boundary catches render errors AND rejected promises that Suspense re-throws. Without the boundary, a failed fetch crashes the whole tree.

## Where to place boundaries

- **Route level:** one Suspense + ErrorBoundary pair around the route's main async data. Fallback should match the route's layout (skeleton header, content blocks), not a spinner.
- **Per volatile region inside a route:** if a sidebar widget fetches independently, give it its own pair. A slow sidebar should not block the main content.
- **Lazy-loaded components:** `React.lazy(...)` requires Suspense. Wrap each lazy boundary with its own fallback.

## What NOT to wrap

- **Synchronous components** — Suspense around code that never suspends is dead weight and confuses future readers.
- **The whole app root** as the only boundary — every failure becomes a full-page error. Use the root pair as a backstop only; put real boundaries near the data.
- **Form inputs and other interactive controls** — never let a suspended sibling unmount the input the user is typing into. Hoist the fetch above the form, or keep the suspending child in a sibling region.

## Fallback patterns

- Use skeleton placeholders that mirror the final layout (height, columns, count) to avoid CLS.
- Reserve spinners for sub-100ms expected loads where a skeleton would feel heavier than the content.
- For lists, render N skeleton rows matching the expected page size.

## Data layer

- Prefer `useSuspenseQuery` (TanStack Query v5) over raw `use(fetch(...))` — it integrates with the query cache, dedupes, and gives proper retry semantics.
- Forward the request `signal` (TanStack Query passes one) into `fetch` so unmount during load cancels the network request.

## Error boundary hygiene

- Provide a `reset` action in the fallback that calls the boundary's `resetErrorBoundary` AND `queryClient.resetQueries({ queryKey })` so the user can retry without a full reload.
- Log via React 19's `onCaughtError` / `onUncaughtError` (configured on `createRoot`) — do not swallow errors silently.

## Review checklist

- Every `useSuspenseQuery`, `use(promise)`, and `React.lazy` has a Suspense ancestor.
- Every Suspense has an ErrorBoundary ancestor in the same logical region.
- Fallbacks match layout — no surprise jumps.
- No boundary wraps an entire page when the slow region is a single card.
- No interactive input lives inside a boundary that can re-suspend mid-typing.

## Anti-patterns

- A single app-root Suspense with a full-page spinner.
- `try { use(p) } catch {}` — `use()` must not be wrapped in try/catch. Use an Error Boundary.
- Calling `useSuspenseQuery` conditionally or inside a loop — Rules of React still apply.
- Reading the same promise in two siblings without `cache()` or a shared query key — you'll fetch twice.
