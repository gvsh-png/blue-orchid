---
name: adding-a-cron-job
description: Use when something must run on a schedule, such as pulling data, sending digests or cleaning up.
---

1. **Write the job** as an `Effect.fn` use case in `packages/core`. It must be safe to run twice or to overlap with itself: cron runs repeat and run late. Done when a test runs it twice and the second run changes nothing.
2. **Register it** in `jobs` in `packages/core/src/jobs.ts`, with a one-line description. If it needs a service `JobServices` lacks, add the service to `JobServices` and to `AppLive` in `apps/tracker/server/AppLive.ts`.
3. **Schedule it** in `apps/tracker/crons/<job-name>.ts`, copying `crons/sync-schedule.ts`: a literal `export const cron` and a default `defineScheduled` that calls `runJob`. Void reads the schedule from that file. Done when `apps/tracker/test/crons.test.ts` passes.
4. **Try it.** Start `pnpm dev` and trigger the job with the curl command Void prints at start-up. Done when the log shows `Job finished` for it.
5. **Gate.** Run `pnpm check`. Done when it passes.
