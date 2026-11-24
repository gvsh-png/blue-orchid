import type { Release, Show } from "@blue-orchid/domain";
import { releaseKey, Update, UpdateId } from "@blue-orchid/domain";
import { DateTime, Effect, Result } from "effect";

import { Catalog } from "../ports/Catalog.ts";
import { ScheduleSources } from "../ports/ScheduleSources.ts";
import { diffReleases } from "./diff.ts";

const firstBy = <A>(items: ReadonlyArray<A>, key: (item: A) => string): ReadonlyArray<A> => {
  const seen = new Map<string, A>();
  for (const item of items) {
    if (!seen.has(key(item))) {
      seen.set(key(item), item);
    }
  }
  return [...seen.values()];
};

/** Pulls every source, stores what it gives, and records an update for each release that is new or moved. */
export const syncSchedule = Effect.fn("Schedule.sync")(function* () {
  const sources = yield* ScheduleSources;
  const catalog = yield* Catalog;
  const now = yield* DateTime.now;
  const from = DateTime.subtract(now, { days: 1 });
  const to = DateTime.add(now, { days: 35 });

  const results = yield* Effect.forEach(sources, (source) => Effect.result(source.fetch(from, to)), {
    concurrency: "unbounded",
  });
  const snapshots = results.filter(Result.isSuccess).map((result) => result.success);
  const failed = results.filter(Result.isFailure).map((result) => result.failure);
  yield* Effect.forEach(failed, (error) => Effect.logWarning("Schedule source failed", error));

  const shows: ReadonlyArray<Show> = firstBy(
    snapshots.flatMap((snapshot) => snapshot.shows),
    (show) => show.id,
  );
  const releases: ReadonlyArray<Release> = firstBy(
    snapshots.flatMap((snapshot) => snapshot.releases),
    releaseKey,
  );
  const stored = yield* catalog.releasesByKey(releases.map(releaseKey));
  const revisions = new Map(stored.map((row) => [releaseKey(row.release), row.revision]));
  const changed = diffReleases(
    stored.map((row) => row.release),
    releases,
  ).map((change) => {
    const key = releaseKey(change.release);
    const revision = (revisions.get(key) ?? 0) + 1;
    return {
      release: { release: change.release, revision },
      update: new Update({ id: UpdateId.make(`${key}:r${revision}`), detectedAt: now, change }),
    };
  });
  yield* catalog.save({
    shows: [],
    showsIfMissing: shows,
    releases: changed.map((row) => row.release),
    updates: changed.map((row) => row.update),
  });
  return { sources: sources.length, failedSources: failed.length, releases: releases.length, updates: changed.length };
});
