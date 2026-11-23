import type { ShowId } from "@blue-orchid/domain";
import { DateTime, Effect } from "effect";

import { Catalog } from "../ports/Catalog.ts";

export const releasesBetween = Effect.fn("Schedule.releasesBetween")(function* (from: DateTime.Utc, to: DateTime.Utc) {
  const catalog = yield* Catalog;
  return yield* catalog.releasesBetween(from, to);
});

export const nextSevenDays = Effect.fn("Schedule.nextSevenDays")(function* () {
  const now = yield* DateTime.now;
  return yield* releasesBetween(now, DateTime.add(now, { days: 7 }));
});

export const nextRelease = Effect.fn("Schedule.nextRelease")(function* (show: ShowId) {
  const catalog = yield* Catalog;
  return yield* catalog.nextRelease(show, yield* DateTime.now);
});
