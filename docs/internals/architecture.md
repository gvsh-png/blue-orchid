# Architecture

One Void app on Cloudflare Workers serves everything: the website's files, the API and the bot, and it runs the
cron jobs. Every surface reads from our own D1 database. None of them calls a schedule source while serving.

**A website visit.** The browser loads the single-page app. A route loader sends a GraphQL operation from
`packages/graphql/src/operations.ts` to `/api/graphql`. The resolver runs a core use case through the app's
runtime, and the use case reads the Catalog port, which `apps/tracker/server/store.ts` implements on D1.

**A slash command.** Discord posts to `/api/discord/interactions`. The Discord adapter verifies the signature,
runs the matching command from `packages/core/src/chat/commands.ts`, and renders its reply. Commands never fail:
every error becomes a reply.

**Sync, every 30 minutes.** `sync-schedule` asks each schedule source for the next five weeks, stores what they
return, and records an update for each release that is new or has moved. The ids are deterministic, so a repeat
run records nothing new.

**Delivery, every 5 minutes.** `deliver-notifications` finds updates that followers have not been sent, sends
each as a DM through the follower's platform, and marks it sent. A failed send stays pending for the next run.
