---
name: dotnet-async-discipline
description: Enforce async-all-the-way in C#. Use when writing or reviewing any .NET code that performs I/O — database queries (EF Core, Dapper), HTTP calls (HttpClient), file or stream operations, or any method that awaits another async method.
---

# .NET Async Discipline

Sync-over-async is the #1 cause of thread-pool starvation and deadlocks in ASP.NET Core. This skill is the checklist to apply every time you touch I/O in C#.

## The Rule

If a method does I/O, it is `async` and returns `Task` / `Task<T>` / `ValueTask<T>`. Its callers `await` it. All the way up to the controller action.

## Forbidden in application code

These patterns block a thread-pool thread on an in-flight async operation. Never write them in controllers, services, or repositories:

- `.Result` on a `Task<T>`
- `.Wait()` on a `Task`
- `.GetAwaiter().GetResult()`
- `Task.Run(() => SomeAsync()).Result` — same problem, dressed up
- `async void` (except for top-level event handlers — never in MVC code)

If you find any of these in a file you're editing, fix them in the same PR or flag for the owner (Rule 12 — fail loud).

## ConfigureAwait(false)

- **Library / reusable package code:** add `.ConfigureAwait(false)` to every `await` to avoid forcing callers onto a captured context.
- **ASP.NET Core application code:** do NOT add `.ConfigureAwait(false)`. ASP.NET Core has no synchronization context, so it's noise. Match the rest of the codebase.

## CancellationToken propagation

Every async I/O path must accept and forward a `CancellationToken`:

1. Controller action takes `CancellationToken ct` as a parameter — MVC binds it to `HttpContext.RequestAborted` automatically.
2. Pass `ct` into every service / repository call.
3. Pass `ct` into EF Core (`ToListAsync(ct)`, `FirstOrDefaultAsync(predicate, ct)`, `SaveChangesAsync(ct)`) and `HttpClient` (`GetAsync(url, ct)`).
4. Inside long loops, check `ct.ThrowIfCancellationRequested()` periodically.

Skipping the token means a client disconnect still costs you a full DB round-trip plus a SaveChanges.

## EF Core specifics

- Always use the `*Async` variant: `ToListAsync`, `FirstOrDefaultAsync`, `AnyAsync`, `CountAsync`, `SaveChangesAsync`.
- `DbContext` is NOT thread-safe — do not `Task.WhenAll` two queries against the same context. Either await them sequentially or open a second scoped context.
- Never store a `DbContext` in a static field, singleton service, or captured closure.

## Review checklist

When reviewing a diff, grep for `.Result`, `.Wait()`, `.GetAwaiter`, `async void`, and any `*Async` method called without `await`. Each hit is a defect, not a style nit.
