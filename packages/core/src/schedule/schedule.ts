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
