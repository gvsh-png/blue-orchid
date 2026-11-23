import type { ChatIdentity } from "@blue-orchid/domain";
import { Effect } from "effect";

import { followed, follow, unfollow } from "../follows/follows.ts";
import type { Catalog } from "../ports/Catalog.ts";
import type { Subscriptions } from "../ports/Subscriptions.ts";
import { nextSevenDays } from "../schedule/schedule.ts";
import type { Message } from "./Message.ts";
import { textMessage } from "./Message.ts";

export type CommandServices = Catalog | Subscriptions;

interface CommandOption {
  readonly name: string;
  readonly description: string;
}

/** A chat command, the same on every platform. Each platform adapter turns these into its own command format. */
export interface ChatCommand {
  readonly description: string;
  readonly options: ReadonlyArray<CommandOption>;
  readonly invoke: (
    args: Readonly<Record<string, string>>,
    caller: ChatIdentity,
  ) => Effect.Effect<Message, never, CommandServices>;
}

/** Commands may not fail: every error becomes a reply, so the person always gets an answer. */
const defineCommand = <const Name extends string = never>(definition: {
  readonly description: string;
  readonly options: { readonly [K in Name]: string };
  /** `option("show")` is the trimmed value the person typed. Options are required, so it is never empty. */
  readonly run: (
    option: (name: Name) => string,
    caller: ChatIdentity,
  ) => Effect.Effect<Message, never, CommandServices>;
}): ChatCommand => {
  const names = Object.keys(definition.options).filter((name): name is Name => name in definition.options);
  return {
    description: definition.description,
    options: names.map((name) => ({ name, description: definition.options[name] })),
    invoke: (args, caller) => {
      const value = (name: string) => (args[name] ?? "").trim();
      const missing = names.filter((name) => value(name) === "");
      return missing.length > 0
        ? Effect.succeed(textMessage(`Missing ${missing.join(", ")}.`))
        : definition.run(value, caller);
    },
  };
};

const storeTrouble = textMessage("Something went wrong on our side. Try again in a minute.");

export const commands = {
  schedule: defineCommand({
    description: "Episodes airing in the next seven days",
    options: {},
    run: () =>
      nextSevenDays().pipe(
        Effect.map((rows) =>
          rows.length === 0
            ? textMessage("Nothing airs in the next seven days.")
            : {
                text: "Airing in the next seven days:",
                entries: rows.map(({ show, release }) => ({
                  title: show.title,
                  detail: `Episode ${release.episode} · ${release.kind} · ${release.region}`,
                  at: release.airsAt,
                  previousAt: null,
                })),
              },
        ),
        Effect.catchTag("StoreFailed", () => Effect.succeed(storeTrouble)),
      ),
  }),
  follow: defineCommand({
    description: "Get a direct message when a show's schedule changes",
    options: { show: "Title of the show" },
    run: (option, caller) =>
      follow(caller, option("show")).pipe(
        Effect.map((found) => textMessage(`You now follow ${found.title}.`)),
        Effect.catchTags({
          ShowNotFound: () => Effect.succeed(textMessage(`No show matches "${option("show")}".`)),
          StoreFailed: () => Effect.succeed(storeTrouble),
        }),
      ),
  }),
  unfollow: defineCommand({
    description: "Stop messages about a show",
    options: { show: "Title of the show" },
    run: (option, caller) =>
      unfollow(caller, option("show")).pipe(
        Effect.map(({ show: found, wasFollowing }) =>
          textMessage(wasFollowing ? `You no longer follow ${found.title}.` : `You did not follow ${found.title}.`),
        ),
        Effect.catchTags({
          ShowNotFound: () => Effect.succeed(textMessage(`No show matches "${option("show")}".`)),
          StoreFailed: () => Effect.succeed(storeTrouble),
        }),
      ),
  }),
  following: defineCommand({
    description: "The shows you follow",
    options: {},
    run: (_, caller) =>
      followed(caller).pipe(
        Effect.map((shows) =>
          textMessage(
            shows.length === 0
              ? "You follow no shows yet. Use /follow to start."
              : `You follow: ${shows.map((show) => show.title).join(", ")}.`,
          ),
        ),
        Effect.catchTag("StoreFailed", () => Effect.succeed(storeTrouble)),
      ),
  }),
} satisfies Record<string, ChatCommand>;

export type CommandName = keyof typeof commands;

export const isCommandName = (name: string): name is CommandName => Object.hasOwn(commands, name);
