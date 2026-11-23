import type { Messenger } from "@blue-orchid/core";
import { MessageNotSent } from "@blue-orchid/domain";
import { Effect, Option, Redacted, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import { discordApi, DiscordConfig } from "./DiscordConfig.ts";
import { renderMessage } from "./render.ts";

const DmChannel = Schema.Struct({ id: Schema.String });

const notSent = (cause: unknown) => new MessageNotSent({ platform: "discord", cause });

/** Sends a DM: open (or reuse) the DM channel, then post to it. */
export const makeDiscordMessenger = Effect.gen(function* () {
  const settings = yield* DiscordConfig;
  const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);

  const messenger: Messenger = {
    send: (userId, message) =>
      Effect.gen(function* () {
        if (Option.isNone(settings)) {
          return yield* Effect.fail(notSent("Discord is not set up: DISCORD_BOT_TOKEN is missing."));
        }
        const authorized = HttpClientRequest.setHeader(
          "Authorization",
          `Bot ${Redacted.value(settings.value.botToken)}`,
        );
        const channel = yield* HttpClientRequest.post(`${discordApi}/users/@me/channels`).pipe(
          authorized,
          HttpClientRequest.bodyJsonUnsafe({ recipient_id: userId }),
          client.execute,
          Effect.flatMap(HttpClientResponse.schemaBodyJson(DmChannel)),
        );
        yield* HttpClientRequest.post(`${discordApi}/channels/${channel.id}/messages`).pipe(
          authorized,
          HttpClientRequest.bodyJsonUnsafe({ content: renderMessage(message), allowed_mentions: { parse: [] } }),
          client.execute,
        );
      }).pipe(Effect.mapError(notSent)),
  };
  return messenger;
});
