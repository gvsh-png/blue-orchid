# tracker

The Void app: the one deployable. It wires packages together and holds what Void needs at fixed paths:
`routes/`, `crons/`, `db/schema.ts`, `env.ts`, `auth.ts`. Logic belongs in a package, not here.

- `server/AppLive.ts` builds every service and is the only reader of `void/env`.
- `server/store.ts` implements core's Catalog and Subscriptions on D1.
- After changing `db/schema.ts`, run `pnpm --filter @blue-orchid/tracker db:generate` and commit the migration.
