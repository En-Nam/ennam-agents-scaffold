---
name: express-error-handling
description: Use when adding or reviewing Express 5 middleware, route handlers, or error flow — covers native async error propagation, the central error middleware signature, mapping Zod errors to 400, and the AppError class.
---

# Express 5 Error Handling Playbook

Express 5 changed the rules. Apply these every time you touch a route, middleware, or error path.

## 1. Native async error propagation

Express 5 forwards rejected promises from async handlers to the error middleware automatically.

- Do NOT install `express-async-errors`.
- Do NOT wrap handlers in a `asyncHandler(fn)` helper unless the project already has one.
- Just write `async (req, res, next) => { ... }` and let throws propagate.

## 2. The one central error middleware

Register exactly one error middleware, last in `app.ts`, with the 4-arg signature:

```ts
app.use((err, req, res, next) => { ... });
```

If you omit the `next` parameter, Express does not recognize it as error middleware. Order matters: it must come AFTER all routes.

## 3. The AppError class

One typed error class, thrown from controllers and services:

```ts
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}
```

Subclass for common cases (`NotFoundError extends AppError` with status 404) only when reused.

## 4. Mapping errors in the middleware

The central middleware maps in this order:

1. `err instanceof ZodError` → 400 with `{ code: 'VALIDATION_ERROR', issues: err.issues }`.
2. `err instanceof AppError` → `err.status` with `{ code: err.code, message: err.message }`.
3. Anything else → 500 with `{ code: 'INTERNAL_ERROR', message: 'Internal Server Error' }`. Log the original via Pino with `req.log.error({ err }, ...)`.

## 5. Never leak internals

- Never put `err.stack` in the response body.
- Never echo `err.message` for the 500 fallback — use a generic message.
- Log the full error server-side with Pino; respond with the sanitized shape.

## 6. From middleware, use `next(err)`

Inside non-error middleware, forward errors with `next(err)`. Do not call `res.status().send()` for errors — that bypasses the central mapping and logging.

## 7. Validate at the route boundary

Parse `req.body` / `req.query` / `req.params` with Zod once, at the top of the handler. Pass the parsed, typed value into the controller. A `ZodError` thrown here lands cleanly in step 4.

## Anti-patterns to reject in review

- `app.use(express-async-errors)` import.
- `try { ... } catch (e) { res.status(500).json({ error: e.message }) }` in every handler.
- Throwing strings (`throw 'not found'`).
- Multiple error middlewares.
- Error middleware registered before routes.
