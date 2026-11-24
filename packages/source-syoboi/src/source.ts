import type { ScheduleSource } from "@blue-orchid/core";
import { Release, Show, ShowId, SourceUnavailable } from "@blue-orchid/domain";
import { DateTime, Duration, Effect, Schedule, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

export const syoboiApi = "https://cal.syoboi.jp/rss2.php";

/** rss2.php answers at most 14 days per request. */
const maxDays = 14;

const Broadcast = Schema.Struct({
  TID: Schema.String,
  Title: Schema.String,
  Count: Schema.NullOr(Schema.String),
  StTime: Schema.String,
  EdTime: Schema.String,
  Cat: Schema.String,
  Flag: Schema.String,
  Deleted: Schema.String,
});

const Listing = Schema.Struct({ items: Schema.Array(Broadcast) });

/** Cat 1 is a running anime; Flag 8 marks a rerun. */
const isNewEpisode = (broadcast: typeof Broadcast.Type) =>
  broadcast.Cat === "1" &&
  broadcast.Title !== "" &&
  broadcast.Deleted === "0" &&
  (Number(broadcast.Flag) & 8) === 0 &&
  broadcast.Count !== null &&
  Number.isInteger(Number(broadcast.Count));

/** Syoboi takes and gives Japan time: YYYYMMDDhhmm. */
const japanTime = (time: DateTime.Utc) =>
  DateTime.formatIso(DateTime.add(time, { hours: 9 }))
    .replace(/\D/g, "")
    .slice(0, 12);

/**
 * Syoboi Calendar's Japanese TV listings as raw JP releases. Its bot rules ask for one request at a time, a second
 * apart, and a User-Agent with a contact page: https://docs.cal.syoboi.jp/rule/bot/
 */
export const makeSyoboiSchedule = Effect.fn("Syoboi.make")(function* (spacing: Duration.Input = "1 second") {
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.filterStatusOk,
    HttpClient.retryTransient({ schedule: Schedule.spaced("1 minute"), times: 2 }),
  );

  const fetchDays = Effect.fn("Syoboi.fetchDays")(function* (start: DateTime.Utc, days: number) {
    return yield* HttpClientRequest.get(syoboiApi).pipe(
      HttpClientRequest.setHeader("User-Agent", "blue-orchid/0.1 (+https://github.com/noxaur/blue-orchid)"),
      HttpClientRequest.setUrlParams({ alt: "json", start: japanTime(start), days: String(days) }),
      client.execute,
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Listing)),
    );
  });

  const fetch = Effect.fn("Syoboi.fetch")(function* (from: DateTime.Utc, to: DateTime.Utc) {
    const broadcasts: Array<typeof Broadcast.Type> = [];
    // Syoboi's days end at whole minutes, so page from a whole minute: the last page then reaches past `to`.
    for (let request = 0, start = DateTime.startOf(from, "minute"); DateTime.isLessThan(start, to); request++) {
      if (request > 0) {
        yield* Effect.sleep(spacing);
      }
      const days = Math.min(maxDays, Math.ceil(Duration.toDays(DateTime.distance(start, to))));
      broadcasts.push(...(yield* fetchDays(start, days)).items);
      start = DateTime.add(start, { days: maxDays });
    }

    // One episode can air on several channels: the first broadcast is its release.
    const first = new Map<string, typeof Broadcast.Type>();
    for (const broadcast of broadcasts.filter(isNewEpisode)) {
      const key = `${broadcast.TID}:${broadcast.Count}`;
      const seen = first.get(key);
      if (seen === undefined || Number(broadcast.StTime) < Number(seen.StTime)) {
        first.set(key, broadcast);
      }
    }
    const releases = [...first.values()]
      .map(
        (broadcast) =>
          new Release({
            showId: ShowId.make(`syoboi:${broadcast.TID}`),
            episode: Number(broadcast.Count),
            kind: "raw",
            region: "JP",
            airsAt: DateTime.makeUnsafe(Number(broadcast.StTime) * 1000),
          }),
      )
      .filter(
        (release) => DateTime.isGreaterThanOrEqualTo(release.airsAt, from) && DateTime.isLessThan(release.airsAt, to),
      );
    const byShow = new Map([...first.values()].map((broadcast) => [`syoboi:${broadcast.TID}`, broadcast]));
    const shows = [...new Set(releases.map((release) => release.showId))].flatMap((id) => {
      const broadcast = byShow.get(id);
      return broadcast === undefined
        ? []
        : [
            new Show({
              id,
              title: broadcast.Title,
              imageUrl: null,
              episodes: null,
              format: null,
              status: "airing",
              season: null,
              year: null,
              startDate: null,
              endDate: null,
              episodeMinutes: Math.round((Number(broadcast.EdTime) - Number(broadcast.StTime)) / 60) || null,
              siteIds: [id],
            }),
          ];
    });
    return { shows, releases };
  });

  const source: ScheduleSource = {
    name: "syoboi",
    fetch: (from, to) =>
      fetch(from, to).pipe(Effect.mapError((cause) => new SourceUnavailable({ source: "syoboi", cause }))),
  };
  return source;
});
