# core

The product's behaviour, with no network, database or platform. Imports `domain` and `effect`.

- A need for the outside world is a port in `src/ports/`, with a fake in `src/testing/InMemory.ts`.
- A use case is an `Effect.fn` that yields the ports it needs (example: `src/schedule/sync.ts`).
- Test with `@effect/vitest` and `makeInMemory` (example: `src/schedule/sync.test.ts`).
