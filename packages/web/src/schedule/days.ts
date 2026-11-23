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
  const days = new Map<string, Array<A>>();
  for (const row of rows) {
    const key = dayKey(airsAt(row), timeZone);
    days.set(key, [...(days.get(key) ?? []), row]);
  }
  const label = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long" });
  return [...days.entries()].map(([key, dayRows]): Day<A> => ({
    key,
    label: label.format(DateTime.toDate(airsAt(dayRows[0]!))),
    rows: dayRows,
  }));
};

export const formatTime = (at: DateTime.Utc, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }).format(DateTime.toDate(at));

export const isTimeZone = (value: string) => Intl.supportedValuesOf("timeZone").includes(value) || value === "UTC";

export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
