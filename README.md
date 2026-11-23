# blue-orchid

An anime release tracker: a website, a private GraphQL API and a Discord bot, on Cloudflare via Void.

## Start

```sh
mise install          # Node and pnpm at the pinned versions
pnpm install
pnpm dev              # http://localhost:5173
pnpm check            # everything CI checks
```

Discord and Discord sign-in are optional locally. To use them, put these in `apps/tracker/.env`:

```ini
DISCORD_APPLICATION_ID=
DISCORD_PUBLIC_KEY=
DISCORD_BOT_TOKEN=
AUTH_DISCORD_CLIENT_ID=
AUTH_DISCORD_CLIENT_SECRET=
```

Then run `pnpm --filter @blue-orchid/tracker discord:register` once, and set the Interactions Endpoint URL in
Discord's developer portal to `https://<host>/api/discord/interactions`.

## Deploy

```sh
pnpm --filter @blue-orchid/tracker exec void secret put DISCORD_BOT_TOKEN   # and the other values above
pnpm --filter @blue-orchid/tracker deploy
```

See [AGENTS.md](AGENTS.md) for how the repo is laid out, and [docs/](docs/README.md) for why.
