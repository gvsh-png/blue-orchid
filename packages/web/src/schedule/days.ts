import { DateTime } from "effect";

export interface Day<A> {
  readonly key: string;
  readonly label: string;
  readonly rows: ReadonlyArray<A>;
}

const dayKey = (at: DateTime.Utc, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    DateTime.toDate(at),
  );

/** Groups rows by calendar day in the reader's timezone, so a 23:30 UTC release lands on the right local day. */
export const groupByDay = <A>(rows: ReadonlyArray<A>, airsAt: (row: A) => DateTime.Utc, timeZone: string) => {
  const label = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long" });
  const days = new Map<string, { label: string; rows: Array<A> }>();
  for (const row of rows) {
    const at = airsAt(row);
    const key = dayKey(at, timeZone);
    const day = days.get(key);
    if (day === undefined) {
      days.set(key, { label: label.format(DateTime.toDate(at)), rows: [row] });
    } else {
      day.rows.push(row);
    }
  }
  return [...days.entries()].map(([key, day]): Day<A> => ({ key, ...day }));
};

export const formatTime = (at: DateTime.Utc, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }).format(DateTime.toDate(at));

export const isTimeZone = (value: string) => Intl.supportedValuesOf("timeZone").includes(value) || value === "UTC";

export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
