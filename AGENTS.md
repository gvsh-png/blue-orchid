# blue-orchid

An anime release tracker: what airs this week, at what time where you are, and a DM when a show you follow
changes. People use the website; people and agents use the Discord bot and the private GraphQL API.

## Done means green

`pnpm check` is the gate: format, lint, types, import boundaries, unused code, docs links and tests. The
pre-commit hook, the Claude Code Stop hook and CI all run it. Work is done when it passes. Every failure prints
its fix; follow the message instead of loosening the rule. A rule that seems wrong is a question for the user.

## Packages

Dependencies point inward: `apps/tracker` → adapters (`graphql`, `chat-discord`, `web`) → `core` → `domain`.
`.dependency-cruiser.cjs` holds the full table, with what each package may import and why.

- `packages/domain`: schemas, branded ids, tagged errors.
- `packages/core`: use cases, ports (`src/ports`), chat commands (`src/chat/commands.ts`), jobs (`src/jobs.ts`), in-memory fakes (`src/testing`).
- `packages/graphql`: the private API (Pothos and Yoga) and the website's operations (`src/operations.ts`).
- `packages/chat-discord`: Discord slash commands and DMs.
- `packages/web`: the website (React, TanStack Router).
- `apps/tracker`: the Void app. Wires everything, owns the database, routes, crons and auth, and deploys.
- `infra`: the Alchemy stack, for cloud resources Void does not own.

Each package has its own AGENTS.md saying what goes in it.

## Effect

Code is Effect v4 throughout: `Effect.fn` for functions, `Context.Service` for services, `Schema.TaggedError`
for errors, `yield* DateTime.now` for time. Effects run only in the composition roots that the root
`vite.config.ts` lists. For any Effect API, read `node_modules/effect/ai-docs/` and the source; your memory of
Effect v3 is wrong for this codebase. Void's docs for the installed version are in `node_modules/void/docs/`.

## Recipes

- New user-facing behaviour (a query, a command, a page): `.claude/skills/adding-a-feature/SKILL.md`.
- New scheduled job: `.claude/skills/adding-a-cron-job/SKILL.md`.
- New chat platform, such as Telegram: `.claude/skills/adding-a-chat-platform/SKILL.md`.

## Ask first

Ask the user before adding a package, an npm dependency, or a cloud resource, and before changing a rule in
`vite.config.ts`, `.dependency-cruiser.cjs` or `tools/lint/orchid.ts`.

## More

`docs/README.md` indexes the rest: why things are the way they are, the glossary, and which check enforces each rule.
