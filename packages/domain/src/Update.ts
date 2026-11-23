import { Schema } from "effect";

import { UpdateId } from "./ids.ts";
import { Release } from "./Release.ts";

/** An update is a change to the schedule that the sync job saw. News and sequel announcements are not updates yet. */
export const Change = Schema.TaggedUnion({
  EpisodeScheduled: { release: Release },
  EpisodeRescheduled: { release: Release, previousAirsAt: Schema.DateTimeUtc },
});
export type Change = typeof Change.Type;

export class Update extends Schema.Class<Update>("Update")({
  id: UpdateId,
  detectedAt: Schema.DateTimeUtc,
  change: Change,
}) {}
