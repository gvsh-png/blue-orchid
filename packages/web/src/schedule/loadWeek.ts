import { ScheduleQuery } from "@blue-orchid/graphql/operations";
import { DateTime, Effect } from "effect";

import { query } from "../api.ts";

/** From the start of today to the start of the same weekday next week, in calendar days of the reader's zone. */
export const weekWindow = (now: DateTime.Utc, timeZone: string) =>
  DateTime.makeZoned(now, { timeZone }).pipe(
    Effect.fromOption,
    Effect.map((zoned) => {
      const start = DateTime.startOf(zoned, "day");
      // Taking the day's start again matters where clocks skip midnight: today may start at 01:00, next week at 00:00.
      const end = DateTime.startOf(DateTime.add(start, { days: 7 }), "day");
      return { from: DateTime.toUtc(start), to: DateTime.toUtc(end) };
    }),
  );

export const loadWeek = Effect.fn("Schedule.loadWeek")(function* (timeZone: string) {
  const { from, to } = yield* weekWindow(yield* DateTime.now, timeZone);
  const result = yield* query(ScheduleQuery, { from: DateTime.formatIso(from), to: DateTime.formatIso(to) });
  return result.schedule;
});
