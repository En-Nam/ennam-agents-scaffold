---
description: Scaffold a new React Router 7 route — route component + Zod-validated loader + Vitest spec, wired into the existing router.
---

Usage: `/react-route <path>`

Steps:
1. Confirm `<path>` is a URL path segment (e.g. `/orders`, `/orders/:id`, `/settings/profile`). Stop and ask if ambiguous. Derive a feature name in kebab-case from the leaf segment (e.g. `orders`, `order-detail`, `profile`).
2. Read the existing router setup (`src/router.tsx` or wherever `createBrowserRouter` lives) and one neighboring route to learn loader + errorElement + lazy-import conventions (Rule 8). Match them.
3. Create `src/features/<feature>/<feature>.schema.ts` with a Zod schema for the loader's response shape. Export the inferred TS type.
4. Create `src/features/<feature>/<feature>.loader.ts` that fetches the data, parses it through the Zod schema, and returns the typed result. Forward `request.signal` to `fetch` for cancellation.
5. Create `src/features/<feature>/<Feature>Route.tsx` as the route component. Use `useLoaderData()` (typed) or `useSuspenseQuery` if the data belongs in the TanStack Query cache. Wrap async regions in `<Suspense>` + an Error Boundary.
6. Register the route in the central router (`src/router.tsx`): add `{ path: '<path>', element: <FeatureRoute />, loader, errorElement: <RouteError /> }` — keep the existing nesting and ordering.
7. Create `src/features/<feature>/__tests__/<Feature>Route.test.tsx` (Vitest + Testing Library + `createMemoryRouter`) covering: happy path render, loader schema-failure path (expect the error element), and one user interaction if the route has any.
8. Run `npm run lint` and `npm run build` — both must pass with zero errors.
9. Run `npm run test:run -- <feature>` — all new specs must pass.
10. Report the created files, the registered route path, and the test results. Do not commit.
