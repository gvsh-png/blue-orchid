import { Schema } from "effect";

/** Every chat platform the bot runs on. Adding one here makes the compiler list each place that needs it. */
export const Platform = Schema.Literals(["discord"]);
export type Platform = typeof Platform.Type;

/** A person on one chat platform. Follows belong to this, not to a website account. */
export class ChatIdentity extends Schema.Class<ChatIdentity>("ChatIdentity")({
  platform: Platform,
  userId: Schema.NonEmptyString,
}) {}
