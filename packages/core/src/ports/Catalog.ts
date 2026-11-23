import type { Release, Show, ShowId, ShowNotFound, StoreFailed, Update } from "@blue-orchid/domain";
import type { DateTime, Effect } from "effect";
import { Context } from "effect";

export interface ScheduledRelease {
  readonly show: Show;
  readonly release: Release;
}

export interface CatalogChanges {
  readonly shows: ReadonlyArray<Show>;
  readonly releases: ReadonlyArray<Release>;
  readonly updates: ReadonlyArray<Update>;
}

/** Shows, releases and updates in our own database. Visitors and bots only ever read from here, never from a source. */
export class Catalog extends Context.Service<
  Catalog,
  {
    readonly releasesBetween: (
      from: DateTime.Utc,
      to: DateTime.Utc,
    ) => Effect.Effect<ReadonlyArray<ScheduledRelease>, StoreFailed>;
    readonly show: (id: ShowId) => Effect.Effect<Show, ShowNotFound | StoreFailed>;
    /** Shows whose title contains the text, best match first. */
    readonly searchShows: (title: string, limit: number) => Effect.Effect<ReadonlyArray<Show>, StoreFailed>;
    readonly releasesByKey: (keys: ReadonlyArray<string>) => Effect.Effect<ReadonlyArray<Release>, StoreFailed>;
    /** Upserts shows and releases, and inserts updates whose id is new. Safe to repeat. */
    readonly save: (changes: CatalogChanges) => Effect.Effect<void, StoreFailed>;
  }
>()("orchid/core/Catalog") {}
