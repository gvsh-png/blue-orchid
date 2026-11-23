import type { ScheduleQuery } from "@blue-orchid/graphql/operations";

import { formatTime, groupByDay } from "./days.ts";

type Row = (typeof ScheduleQuery.result.Type)["schedule"][number];

const kindLabel = { raw: "Japan", sub: "Sub", dub: "Dub" } as const;

export function SchedulePage(props: { readonly rows: ReadonlyArray<Row>; readonly timeZone: string }) {
  const days = groupByDay(props.rows, (row) => row.release.airsAt, props.timeZone);
  if (days.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">
        No episodes this week yet. The schedule fills in once a data source is connected.
      </p>
    );
  }
  return (
    <div className="space-y-8">
      {days.map((day) => (
        <section key={day.key}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">{day.label}</h2>
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {day.rows.map((row) => (
              <li
                key={`${row.show.id}:${row.release.episode}:${row.release.kind}:${row.release.region}`}
                className="flex items-center gap-4 px-4 py-3"
              >
                <time className="w-12 font-mono text-sm tabular-nums">
                  {formatTime(row.release.airsAt, props.timeZone)}
                </time>
                <span className="flex-1 truncate font-medium">{row.show.title}</span>
                <span className="text-sm text-zinc-500">Ep {row.release.episode}</span>
                <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
                  {kindLabel[row.release.kind]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
