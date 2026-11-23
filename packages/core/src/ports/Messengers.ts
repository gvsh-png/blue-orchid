import type { MessageNotSent, Platform } from "@blue-orchid/domain";
import type { Effect } from "effect";
import { Context } from "effect";

import type { Message } from "../chat/Message.ts";

/** Sends a direct message to one user on one platform. */
export interface Messenger {
  readonly send: (userId: string, message: Message) => Effect.Effect<void, MessageNotSent>;
}

/** One messenger per platform. The record type makes a new platform a compile error until it has one. */
export class Messengers extends Context.Service<Messengers, { readonly [P in Platform]: Messenger }>()(
  "orchid/core/Messengers",
) {}
