---
name: react-actions-mutations
description: Use when handling a form submission, a mutation (create/update/delete), or any user action that needs pending state, optimistic UI, error rollback, or cache invalidation — covers React 19 Actions + `useActionState` + `useFormStatus` + `useOptimistic` paired with a TanStack Query mutation.
---

# React 19 Actions + Mutations

React 19 Actions handle the UI lifecycle (pending, error, optimistic). TanStack Query owns the cache. Use both — they are not redundant.

## The shape

```tsx
const [state, formAction, isPending] = useActionState(async (_prev, formData) => {
  const parsed = OrderSchema.parse(Object.fromEntries(formData));
  try {
    await createOrderMutation.mutateAsync(parsed);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}, { ok: false });
```

- `formAction` is passed to `<form action={formAction}>`.
- `isPending` reflects the in-flight Action — drive button disabled state with it.
- The Action body validates with Zod, then delegates the actual network call to a TanStack Query mutation so the cache stays the source of truth.

## Pending UI

Inside the form, use `useFormStatus` (must be in a child of the `<form>`, not the form itself):

```tsx
function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>;
}
```

Do not duplicate `useActionState`'s `isPending` and `useFormStatus`'s `pending` for the same button — pick one based on where the component lives.

## Optimistic updates

`useOptimistic` for instant UI; TanStack Query for durable cache:

```tsx
const [optimisticOrders, addOptimistic] = useOptimistic(orders, (curr, draft) => [...curr, draft]);

async function action(_prev, formData) {
  const draft = OrderSchema.parse(...);
  addOptimistic(draft);              // paint immediately
  await mutation.mutateAsync(draft); // truth lands in the query cache
}
```

The optimistic state auto-rolls back if the Action throws — no manual cleanup needed.

## Cache invalidation (TanStack Query)

After a successful mutation, invalidate or update the relevant queries:

```tsx
const mutation = useMutation({
  mutationFn: api.createOrder,
  onSuccess: (created) => {
    queryClient.setQueryData(orderKeys.detail(created.id), created);
    queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
  },
});
```

- Prefer `setQueryData` for the exact updated entity (no extra fetch).
- Use `invalidateQueries` for list views that may have changed shape.

## Rollback strategy

- For optimistic UI, prefer `useOptimistic` over TanStack Query's `onMutate` rollback unless the same change must persist across navigation — then use both (`onMutate` snapshots, `onError` restores from snapshot).
- Always return a serializable error from the Action (`{ ok: false, error: string }`) so the form can render the message without re-throwing.

## Validation

- Validate `FormData` with a Zod schema inside the Action — never trust raw form values.
- Surface field-level errors via `state.errors?.fieldName` and render them next to the input.

## Review checklist

- Every form mutation uses `useActionState` (not a raw `onSubmit` handler) so React owns the pending state.
- Submit buttons reflect pending state — no double-submit possible.
- Zod parse happens BEFORE the network call.
- Server result lands in TanStack Query's cache (`setQueryData` or `invalidateQueries`).
- Optimistic updates have a clear rollback path (`useOptimistic` auto-rollback, or `onMutate`/`onError` snapshot).
- Error messages are user-readable strings, not raw exception objects.

## Anti-patterns

- Calling `fetch` / `axios` directly inside the Action without going through a TanStack Query mutation — the cache goes stale.
- Setting React state manually for pending/error when `useActionState` already provides it.
- Mutating the query cache inside `useOptimistic`'s updater — `useOptimistic` is for the local optimistic state only.
- Using `'use server'` — that is a Next.js / RSC directive and does nothing in a Vite SPA.
