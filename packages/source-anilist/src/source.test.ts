import { CatalogSource, ScheduleSources, syncSchedule } from "@blue-orchid/core";
import { makeInMemory } from "@blue-orchid/core/testing";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { TestClock } from "effect/testing";

import { AniListCatalogLive, makeAniListSchedule } from "./source.ts";

const goblin = {
  id: 209219,
  idMal: 63712,
  title: { english: "So What's Wrong with Getting Reborn as a Goblin?", romaji: "Tensei Goblin dakedo Shitsumon Aru?" },
  coverImage: { large: "https://img.anili.st/goblin.jpg" },
  episodes: 12,
  format: "ONA",
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

const page = (hasNextPage: boolean, media: ReadonlyArray<unknown>) => ({
  data: { Page: { pageInfo: { hasNextPage }, media } },
});

/** Answers each request with the next of `pages`, and records the request bodies. */
const anilistAnswering = (pages: ReadonlyArray<unknown>) => {
  const bodies: Array<string> = [];
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      bodies.push(request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : "");
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(pages[(bodies.length - 1) % pages.length])),
      );
    }),
  );
  const http = Layer.succeed(HttpClient.HttpClient, client);
  return { bodies, http, layer: AniListCatalogLive.pipe(Layer.provide(http)) };
};

describe("AniListCatalogLive", () => {
  it.effect("reads every page of a slice into shows", () =>
    Effect.gen(function* () {
      const anilist = anilistAnswering([page(true, [goblin]), page(false, [announced])]);
      const shows = yield* CatalogSource.use((source) => source.fetch({ _tag: "Airing" })).pipe(
        Effect.provide(anilist.layer),
      );

      expect(shows[0]).toMatchObject({
        id: "anilist:209219",
        title: "So What's Wrong with Getting Reborn as a Goblin?",
        imageUrl: "https://img.anili.st/goblin.jpg",
        episodes: 12,
        format: "ona",
        status: "airing",
        season: "fall",
        year: 2026,
        startDate: "2026-10-05",
        endDate: "2026-12",
        episodeMinutes: 24,
        siteIds: ["anilist:209219", "myanimelist:63712"],
      });
      expect(shows[1]).toMatchObject({
        title: "Mada Mada",
        format: null,
        status: "upcoming",
        startDate: "2027",
        endDate: null,
        siteIds: ["anilist:999"],
      });
      expect(anilist.bodies.map((body) => body.match(/"page":(\d+)/)?.[1])).toEqual(["1", "2"]);
      expect(anilist.bodies[0]).toContain('"status":"RELEASING"');
    }),
  );

  it.effect("skips a show the catalog can't hold and keeps the rest of the slice", () =>
    Effect.gen(function* () {
      const untitled = { ...goblin, id: 1, title: { english: "", romaji: null } };
      const anilist = anilistAnswering([page(false, [untitled, goblin])]);
      const shows = yield* CatalogSource.use((source) => source.fetch({ _tag: "Airing" })).pipe(
        Effect.provide(anilist.layer),
      );
      expect(shows.map((show) => show.id)).toEqual(["anilist:209219"]);
    }),
  );

  it.effect("asks for one start year as a FuzzyDateInt range", () =>
    Effect.gen(function* () {
      const anilist = anilistAnswering([page(false, [])]);
      yield* CatalogSource.use((source) => source.fetch({ _tag: "Year", year: 2009 })).pipe(
        Effect.provide(anilist.layer),
      );
      expect(anilist.bodies[0]).toContain('"from":20089999,"to":20100000');
    }),
  );

  it.effect("fails as SourceUnavailable when AniList answers something else", () =>
    Effect.gen(function* () {
      const anilist = anilistAnswering([{ errors: [{ message: "Too Many Requests." }] }]);
      const error = yield* Effect.flip(
        CatalogSource.use((source) => source.fetch({ _tag: "Upcoming" })).pipe(Effect.provide(anilist.layer)),
      );
      expect(error._tag).toBe("SourceUnavailable");
    }),
  );
});

describe("makeAniListSchedule", () => {
  const week = { from: DateTime.makeUnsafe("2026-11-23T00:00:00Z"), to: DateTime.makeUnsafe("2026-11-30T23:00:00Z") };
  const airing = {
    ...goblin,
    airingSchedule: {
      nodes: [
        { episode: 9, airingAt: 1796043600 },
        { episode: 10, airingAt: 1796648400 },
      ],
    },
  };
  const answers = [page(false, [airing, { ...announced, airingSchedule: { nodes: [] } }])];

  it.effect("gives raw JP releases in the window, with only the shows that have one", () =>
    Effect.gen(function* () {
      const anilist = anilistAnswering(answers);
      const source = yield* makeAniListSchedule.pipe(Effect.provide(anilist.http));
      const snapshot = yield* source.fetch(week.from, week.to);

      expect(snapshot.shows.map((show) => show.id)).toEqual(["anilist:209219"]);
      expect(
        snapshot.releases.map((r) => [r.showId, r.episode, r.kind, r.region, DateTime.formatIso(r.airsAt)]),
      ).toEqual([["anilist:209219", 9, "raw", "JP", "2026-11-30T13:00:00.000Z"]]);
      expect(anilist.bodies[0]).toContain('"statusIn":["RELEASING","NOT_YET_RELEASED"],"withEpisodes":true');
    }),
  );

  it.effect(
    "a second sync with the same answers records no new updates (sync asks for five weeks, so both episodes count)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(DateTime.toEpochMillis(week.from));
        const memory = yield* makeInMemory({});
        const source = yield* makeAniListSchedule.pipe(Effect.provide(anilistAnswering(answers).http));
        const layer = Layer.merge(memory.layer, ScheduleSources.layer([source]));

        expect((yield* syncSchedule().pipe(Effect.provide(layer))).updates).toBe(2);
        expect((yield* syncSchedule().pipe(Effect.provide(layer))).updates).toBe(0);
      }),
  );
});
