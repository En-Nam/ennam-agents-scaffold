---
name: rn-reanimated-worklets
description: Use when animating any UI in React Native — gestures, transitions, scroll-driven effects, shared-element style motion. Covers the worklet contract (pure, no JS closures), useSharedValue / useAnimatedStyle / runOnJS rules, and common mistakes that cause crashes or silent fall-back to the JS thread.
---

# Reanimated 3 Worklets — Discipline

Reanimated 3 runs animations on the native UI thread via worklets. The legacy `Animated` API (which runs on the JS thread) is forbidden in this project — see @rn-new-architecture-discipline. Apply this checklist every time you animate.

## 1. The worklet contract

A worklet is a JS function that the Reanimated runtime serializes and runs on the UI thread. It MUST be:

- **Pure** — same inputs produce same outputs. No side effects other than writing to shared values.
- **Top-level** or marked with `'worklet';` as the first statement.
- **Closure-safe** — it may close over shared values, plain primitives, and other worklets, but NOT over: React state, React refs, network clients, mutable JS objects, or anything from the JS realm.

If you violate any of these, Reanimated will either error at startup ("Failed to serialize") or silently fall back to running on the JS thread — defeating the entire point.

## 2. State: `useSharedValue`, not `useState`

- Animation state lives in `useSharedValue<T>(initial)`. Read / write via `.value`.
- `.value` writes from JS schedule a UI-thread update.
- `.value` reads inside a worklet are synchronous and cheap.
- Never call a React `setState` inside a worklet directly — use `runOnJS` (see §4).

## 3. Derived styles: `useAnimatedStyle`

```ts
const style = useAnimatedStyle(() => ({
  transform: [{ translateX: offset.value }],
  opacity: interpolate(progress.value, [0, 1], [0, 1]),
}));
```

- The callback is a worklet — same rules as §1.
- Only return style props supported by the native view (no layout-only props that need yoga relayout at 60fps).
- Do NOT create new objects per frame outside the return — allocate inline so the compiler can inline.

## 4. Crossing back to JS: `runOnJS`

When you must call into JS land (navigate, fire an analytics event, set React state):

```ts
import { runOnJS } from 'react-native-reanimated';

const onEnd = () => {
  navigation.navigate('Done');
};

const gesture = Gesture.Pan().onEnd(() => {
  'worklet';
  if (offset.value > THRESHOLD) {
    runOnJS(onEnd)();
  }
});
```

- `runOnJS(fn)(args)` — note the two call sites: the wrapping returns a callable, you invoke it with args.
- The wrapped function runs ASYNCHRONOUSLY on JS. Don't `await` it.
- Wrap only stable JS-thread functions (declared at module scope or via `useCallback`); a fresh closure each render forces re-wrapping every frame.

## 5. Timing & spring helpers

Use the built-in animation drivers; do NOT roll your own `requestAnimationFrame` loop:

- `withTiming(toValue, { duration, easing })`
- `withSpring(toValue, { damping, stiffness, mass })`
- `withDecay({ velocity, clamp })`
- `withSequence(...)`, `withDelay(...)`, `withRepeat(...)` for composition.

These return values you assign to `.value`:

```ts
offset.value = withTiming(100, { duration: 200 });
```

## 6. Gestures

For touch-driven motion, use `react-native-gesture-handler` v2 with the `Gesture` API (NOT the legacy `PanGestureHandler` component). The gesture callbacks are worklets — same rules.

## 7. Common mistakes (review fails)

- Touching React state inside a worklet without `runOnJS`.
- Allocating new objects / arrays inside a worklet's hot path each frame (forces re-serialization).
- Capturing a React ref's `.current` inside a worklet — the snapshot is taken at worklet-serialize time and goes stale.
- Calling `setState(...)` inside `useAnimatedReaction` — wrap with `runOnJS`.
- Using `Animated` (legacy) from `react-native` in the same component as a Reanimated worklet — they don't compose, and the legacy one runs on JS.
- Mutating `.value` inside a render body (the render is JS-side; this works but races with worklet writes). Mutate inside effects, handlers, or worklets only.
- Forgetting `'worklet';` in a function passed to `useDerivedValue` / gesture callbacks — it then runs on the JS thread silently.

## Anti-patterns to reject in review

- Import of `Animated` from `react-native` in a file that also imports from `react-native-reanimated`.
- A `useEffect` that drives animation by writing to a `useSharedValue` in a `setInterval` — use `withRepeat` instead.
- `runOnJS(setSomeState)(value)` called every frame inside `useAnimatedStyle` — leak the result via shared value and read from React land instead.
- Worklets that throw — exceptions on the UI thread crash the app silently in release builds.
