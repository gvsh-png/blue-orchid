---
name: adding-a-feature
description: Use when adding user-facing behaviour to the tracker, such as a query, a chat command, a page, or a new kind of data.
---

Build the feature as one vertical slice, inside out. Each step ends when its "done when" holds.

1. **Name it.** Find or add the term in `docs/internals/glossary.md`. Done when every new noun in the feature has one entry and the code will use exactly that word.
2. **Model it.** Add Schemas, branded ids and tagged errors to `packages/domain`. Done when the types say which values are valid and which errors can happen.
3. **Port it.** If the feature needs the outside world, add or extend a port in `packages/core/src/ports/` and its fake in `packages/core/src/testing/InMemory.ts`. Done when core compiles without knowing how the port is implemented.
4. **Write the use case.** An `Effect.fn` in `packages/core/src/<area>/`. Done when a test with `makeInMemory` covers the happy path and each tagged error.
5. **Store it.** Implement the port in `apps/tracker/server/store.ts`. If tables change, edit `apps/tracker/db/schema.ts` and run `pnpm --filter @blue-orchid/tracker db:generate`. Done when the migration is generated and reviewed.
6. **Expose it**, in whichever of these the feature needs:
   - API: a field in `packages/graphql/src/schema.ts`.
   - Website: an operation in `packages/graphql/src/operations.ts`, then a route in `packages/web/src/router.tsx`.
   - Chat: a command in `packages/core/src/chat/commands.ts`, then `discord:register`.
     Done when every surface the feature names reaches the use case, and none reaches past it.
7. **Gate.** Run `pnpm check`. Done when it passes.
