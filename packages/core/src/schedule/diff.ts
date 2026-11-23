import type { Change, Release } from "@blue-orchid/domain";
import { releaseKey } from "@blue-orchid/domain";
import { DateTime } from "effect";

/** What changed between the releases we stored and the ones the sources give now. A release that disappears is not a change. */
export const diffReleases = (
  stored: ReadonlyArray<Release>,
  incoming: ReadonlyArray<Release>,
): ReadonlyArray<Change> => {
  const before = new Map(stored.map((release) => [releaseKey(release), release]));
  return incoming.flatMap((release): ReadonlyArray<Change> => {
    const previous = before.get(releaseKey(release));
    if (previous === undefined) {
      return [{ _tag: "EpisodeScheduled", release }];
    }
    if (DateTime.Equivalence(previous.airsAt, release.airsAt)) {
      return [];
    }
    return [{ _tag: "EpisodeRescheduled", release, previousAirsAt: previous.airsAt }];
  });
};
