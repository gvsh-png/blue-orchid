import { ScheduleQuery } from "@blue-orchid/graphql/operations";
import { DateTime, Effect } from "effect";

import { query } from "../api.ts";

/** Seven days from the start of today in the reader's timezone. */
export const loadWeek = Effect.fn("Schedule.loadWeek")(function* (timeZone: string) {
  const now = yield* DateTime.now;
  const zoned = yield* DateTime.makeZoned(now, { timeZone }).pipe(Effect.fromOption);
  const from = DateTime.toUtc(DateTime.startOf(zoned, "day"));
  const to = DateTime.add(from, { days: 7 });
  const result = yield* query(ScheduleQuery, { from: DateTime.formatIso(from), to: DateTime.formatIso(to) });
  return result.schedule;
});
