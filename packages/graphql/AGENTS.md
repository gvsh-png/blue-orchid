# graphql

The private API. Imports `core`, `domain`, `graphql`, `graphql-yoga` and `@pothos/core`.

- Fields go in `src/schema.ts`. A resolver maps domain errors to `src/errors.ts` and hands the Effect to `context.run`.
- Every query the website sends goes in `src/operations.ts` with a result Schema. `src/operations.test.ts` checks
  each one against the schema.
