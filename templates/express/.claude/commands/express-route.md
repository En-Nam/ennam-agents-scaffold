---
description: Scaffold a new Express 5 resource route with Zod schema, controller, and supertest integration spec.
---

Usage: `/express-route <resource>`

Steps:
1. Confirm `<resource>` is singular kebab-case (e.g. `user`, `order-item`). Stop and ask if ambiguous.
2. Create `src/routes/<resource>.ts` exporting a `Router` with the standard verbs the task requires (default: `GET /`, `GET /:id`, `POST /`).
3. Create `src/schemas/<resource>.ts` with Zod schemas for body / query / params. Export inferred TS types.
4. Create `src/controllers/<resource>.ts` with one async function per route; accept already-parsed typed input, return data or throw `AppError`.
5. Wire the router into `src/app.ts` with `app.use('/<resource>', <resource>Router)`. Keep the existing middleware order intact.
6. Create `src/routes/__tests__/<resource>.spec.ts` using supertest against the exported `app`. Cover: happy path, Zod validation failure (expect 400), and not-found / error path.
7. Run `npm run build` (or `tsc --noEmit`) — must pass with zero errors.
8. Run `npm test -- <resource>` — all new specs must pass.
9. Report the created files and the test results. Do not commit.
