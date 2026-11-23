# web

The website. Imports `@blue-orchid/graphql/operations`, React, TanStack Router and `effect`.

- Pages are routes in `src/router.tsx`. A loader runs an Effect with `run` from `src/runtime.ts`.
- Data comes only from `query(Operation)` in `src/api.ts`. A new query starts in `packages/graphql/src/operations.ts`.
