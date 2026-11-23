import { DateTime, Effect, Result } from "effect";

import { Catalog } from "../ports/Catalog.ts";
import type { CatalogSlice } from "../ports/CatalogSource.ts";
import { CatalogSource } from "../ports/CatalogSource.ts";

const firstYear = 1917;

/** Hourly runs: even hours alternate airing and upcoming shows, odd hours walk the start years from next year back. */
export const sliceFor = (now: DateTime.Utc): CatalogSlice => {
  const hour = Math.floor(DateTime.toEpochMillis(now) / 3_600_000);
  if (hour % 2 === 0) {
    return hour % 4 === 0 ? { _tag: "Airing" } : { _tag: "Upcoming" };
  }
  const nextYear = DateTime.getPartUtc(now, "year") + 1;
  return { _tag: "Year", year: nextYear - (((hour - 1) / 2) % (nextYear - firstYear + 1)) };
};

export const importCatalog = Effect.fn("Catalog.import")(function* () {
  const source = yield* CatalogSource;
  const catalog = yield* Catalog;
  const slice = sliceFor(yield* DateTime.now);
  const result = yield* Effect.result(source.fetch(slice));
  if (Result.isFailure(result)) {
    yield* Effect.logWarning("Catalog source failed", result.failure);
    return { slice, shows: 0 };
  }
  yield* catalog.save({ shows: result.success, releases: [], updates: [] });
  return { slice, shows: result.success.length };
});
