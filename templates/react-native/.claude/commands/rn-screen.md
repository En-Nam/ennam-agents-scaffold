---
description: Scaffold an Expo Router screen file under app/ with a co-located data hook and a Jest + RNTL unit test.
---

Usage: `/rn-screen <name>`

Steps:
1. Confirm `<name>` is lowercase, hyphen-separated (`user-settings`, `order-detail`). Stop and ask if ambiguous or PascalCase.
2. Read `app/_layout.tsx` and 1-2 sibling screens to learn the project's stack / tab layout, header conventions, and import aliases (Rule 8). Reuse them — do not invent a new convention.
3. Create `app/<name>.tsx` as a default-exported React component:
   - Use NativeWind `className` for styling (do not mix with `StyleSheet`).
   - Render loading, error, and success states explicitly.
   - Consume the hook from step 4 — do not put data fetching in the screen itself.
4. Create `features/<name>/use-<name>.ts` exporting a TanStack Query hook (`useQuery` with a query-key factory). Set a sensible `staleTime`. Validate the API response with Zod and export the inferred type.
5. Create `features/<name>/__tests__/<name>.test.tsx` (Jest + React Native Testing Library):
   - Mock the hook via `jest.mock`.
   - Cover loading state, error state, and rendered-data state.
   - Use `screen.getByRole` / `getByText` queries — never `getByTestId` unless no semantic query works.
6. If the screen needs a route param, wire it via `useLocalSearchParams` from `expo-router` and parse with Zod at the boundary.
7. Do NOT add a new entry in any tabs / drawer layout unless explicitly asked — Expo Router auto-registers the file. Surface this to the user instead.
8. Run `npm run lint` and `npm test -- <name>` — both must pass with zero new warnings.
9. Report the created files and the test results. Do not start a simulator and do not commit.
