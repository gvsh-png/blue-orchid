import type { Message, MessageEntry } from "@blue-orchid/core";
import { DateTime } from "effect";

/** Discord's limit for one message. */
const maxLength = 2000;

const escape = (text: string) => text.replace(/[\\*_~`|>]/g, (char) => `\\${char}`);

/** `<t:…>` renders in each reader's own timezone and language. */
const stamp = (at: DateTime.Utc, style: "f" | "R") => `<t:${Math.floor(DateTime.toEpochMillis(at) / 1000)}:${style}>`;

const line = (entry: MessageEntry) => {
  const was = entry.previousAt === null ? "" : ` (was ${stamp(entry.previousAt, "f")})`;
  return `**${escape(entry.title)}** · ${escape(entry.detail)} · ${stamp(entry.at, "f")} ${stamp(entry.at, "R")}${was}`;
};

export const renderMessage = (message: Message): string => {
  const lines = [escape(message.text)];
  for (const [index, entry] of message.entries.entries()) {
    const next = line(entry);
    const rest = message.entries.length - index;
    const tail = `…and ${rest} more`;
    if ([...lines, next, tail].join("\n").length > maxLength) {
      return [...lines, tail].join("\n");
    }
    lines.push(next);
  }
  return lines.join("\n");
};
