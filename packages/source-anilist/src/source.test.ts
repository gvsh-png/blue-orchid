import { ScheduleSources, syncSchedule } from "@blue-orchid/core";
import { makeInMemory } from "@blue-orchid/core/testing";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { TestClock } from "effect/testing";

import { makeAniListSource } from "./source.ts";

const goblin = {
  id: 209219,
  idMal: 63712,
  isAdult: false,
  title: { english: "So What's Wrong with Getting Reborn as a Goblin?", romaji: "Tensei Goblin dakedo Shitsumon Aru?" },
  coverImage: { large: "https://img.anili.st/goblin.jpg" },
  episodes: 12,
  format: "TV",
  status: "RELEASING",
  season: "FALL",
  seasonYear: 2026,
  startDate: { year: 2026, month: 10, day: 5 },
  endDate: { year: 2026, month: 12, day: null },
  duration: 24,
};

const announced = {
  ...goblin,
  id: 999,
  idMal: null,
  title: { english: null, romaji: "Mada Mada" },
  coverImage: null,
  episodes: null,
  format: "MUSIC",
  status: "NOT_YET_RELEASED",
  season: null,
  seasonYear: null,
  startDate: { year: 2027, month: null, day: null },
  endDate: null,
  duration: null,
};

const page = (hasNextPage: boolean, airingSchedules: ReadonlyArray<unknown>) => ({
  data: { Page: { pageInfo: { hasNextPage }, airingSchedules } },
});

/** AniList's answers in order, one per request, repeating from the start for each new fetch. */
const anilistAnswering = (pages: ReadonlyArray<unknown>) => {
  let calls = 0;
  return Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.sync(() =>
        HttpClientResponse.fromWeb(request, new Response(JSON.stringify(pages[calls++ % pages.length]))),
      ),
    ),
  );
};

const answers = [
  page(true, [
    { episode: 8, airingAt: 1795438800, media: goblin },
    { episode: 1, airingAt: 1795442400, media: { ...goblin, id: 1, isAdult: true } },
  ]),
  page(false, [
    { episode: 9, airingAt: 1796043600, media: goblin },
    { episode: 1, airingAt: 1796047200, media: announced },
  ]),
];

const week = { from: DateTime.makeUnsafe("2026-11-23T00:00:00Z"), to: DateTime.makeUnsafe("2026-11-30T23:00:00Z") };

describe("makeAniListSource", () => {
  it.effect("reads every page into shows and raw JP releases, leaving out adult titles", () =>
    Effect.gen(function* () {
      const source = yield* makeAniListSource.pipe(Effect.provide(anilistAnswering(answers)));
      const snapshot = yield* source.fetch(week.from, week.to);

      expect(
        snapshot.releases.map((r) => [r.showId, r.episode, r.kind, r.region, DateTime.formatIso(r.airsAt)]),
      ).toEqual([
        ["anilist:209219", 8, "raw", "JP", "2026-11-23T13:00:00.000Z"],
        ["anilist:209219", 9, "raw", "JP", "2026-11-30T13:00:00.000Z"],
        ["anilist:999", 1, "raw", "JP", "2026-11-30T14:00:00.000Z"],
      ]);
      const [first, second] = snapshot.shows;
      expect(first).toMatchObject({
        id: "anilist:209219",
        title: "So What's Wrong with Getting Reborn as a Goblin?",
        imageUrl: "https://img.anili.st/goblin.jpg",
        episodes: 12,
        format: "tv",
        status: "airing",
        season: "fall",
        year: 2026,
        startDate: "2026-10-05",
        endDate: "2026-12",
        episodeMinutes: 24,
        siteIds: ["anilist:209219", "myanimelist:63712"],
      });
      expect(second).toMatchObject({
        title: "Mada Mada",
        format: null,
        status: "upcoming",
        startDate: "2027",
        endDate: null,
        siteIds: ["anilist:999"],
      });
    }),
  );

  it.effect("fails as SourceUnavailable when AniList answers something else", () =>
    Effect.gen(function* () {
      const source = yield* makeAniListSource.pipe(Effect.provide(anilistAnswering([{ errors: ["rate limited"] }])));
      const error = yield* Effect.flip(source.fetch(week.from, week.to));
      expect(error._tag).toBe("SourceUnavailable");
    }),
  );

  it.effect("a second sync with the same answers changes nothing", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(DateTime.toEpochMillis(week.from));
      const memory = yield* makeInMemory({});
      const source = yield* makeAniListSource.pipe(Effect.provide(anilistAnswering(answers)));
      const layer = Layer.merge(memory.layer, ScheduleSources.layer([source]));

      expect((yield* syncSchedule().pipe(Effect.provide(layer))).updates).toBe(3);
      expect((yield* syncSchedule().pipe(Effect.provide(layer))).updates).toBe(0);
      expect(yield* memory.updates).toHaveLength(3);
    }),
  );
});
