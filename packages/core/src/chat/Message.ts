import type { DateTime } from "effect";

/** One line of a message about a release. Platforms render `at` in the reader's own timezone where they can. */
export interface MessageEntry {
  readonly title: string;
  readonly detail: string;
  readonly at: DateTime.Utc;
  readonly previousAt: DateTime.Utc | null;
}

/** What the bot says, before any platform formats it. */
export interface Message {
  readonly text: string;
  readonly entries: ReadonlyArray<MessageEntry>;
}

export const textMessage = (text: string): Message => ({ text, entries: [] });
