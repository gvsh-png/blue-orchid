import { ScheduleSources, syncSchedule } from "@blue-orchid/core";
import { makeInMemory } from "@blue-orchid/core/testing";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Fiber, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { TestClock } from "effect/testing";

import { makeSyoboiSchedule } from "./source.ts";

const broadcast = (overrides: Record<string, string | null>) => ({
  TID: "6000",
  Title: "葬送のフリーレン",
  Count: "9",
  StTime: "1795489200",
  EdTime: "1795491000",
  Cat: "1",
  Flag: "0",
  Deleted: "0",
  ChName: "日本テレビ",
  ...overrides,
});

const listing = {
  items: [
    broadcast({ StTime: "1795496400", EdTime: "1795498200", ChName: "BS日テレ" }),
    broadcast({}),
    broadcast({ Count: "8", Flag: "8" }),
    broadcast({ TID: "7000", Title: "再放送", Cat: "10" }),
    broadcast({ TID: "7001", Title: "特番", Count: null }),
    broadcast({ TID: "7002", Title: "削除", Deleted: "1" }),
  ],
  chInfo: {},
};

/** Answers every request with `body`, and records each request's query. */
const syoboiAnswering = (body: unknown) => {
  const queries: Array<string> = [];
  const client = HttpClient.make((request, url) =>
    Effect.sync(() => {
      queries.push(url.search);
      return HttpClientResponse.fromWeb(request, new Response(JSON.stringify(body)));
    }),
  );
  return { queries, layer: Layer.succeed(HttpClient.HttpClient, client) };
};

const from = DateTime.makeUnsafe("2026-11-24T03:00:00Z");

describe("makeSyoboiSchedule", () => {
  it.effect(
    "keeps each new episode's first broadcast, and leaves out reruns, specials and deleted ones",
    Effect.fn(function* () {
      const syoboi = syoboiAnswering(listing);
      const source = yield* makeSyoboiSchedule("0 millis").pipe(Effect.provide(syoboi.layer));
      const snapshot = yield* source.fetch(from, DateTime.add(from, { days: 7 }));

      expect(
        snapshot.releases.map((r) => [r.showId, r.episode, r.kind, r.region, DateTime.formatIso(r.airsAt)]),
      ).toEqual([["syoboi:6000", 9, "raw", "JP", "2026-11-24T03:00:00.000Z"]]);
      expect(snapshot.shows).toHaveLength(1);
      expect(snapshot.shows[0]).toMatchObject({
        id: "syoboi:6000",
        title: "葬送のフリーレン",
        status: "airing",
        episodeMinutes: 30,
        siteIds: ["syoboi:6000"],
      });
    }),
  );

  it.effect(
    "asks for at most 14 days at a time in Japan time, one request a second apart",
    Effect.fn(function* () {
      const syoboi = syoboiAnswering({ items: [] });
      const source = yield* makeSyoboiSchedule().pipe(Effect.provide(syoboi.layer));
      const fiber = yield* Effect.forkChild(source.fetch(from, DateTime.add(from, { days: 20 })));
      yield* TestClock.adjust("500 millis");
      expect(syoboi.queries).toHaveLength(1);
      yield* TestClock.adjust("1 second");
      yield* Fiber.join(fiber);
      expect(syoboi.queries).toEqual(["?alt=json&start=202611241200&days=14", "?alt=json&start=202612081200&days=6"]);
    }),
  );

  it.effect(
    "a second sync with the same listing records no new updates",
    Effect.fn(function* () {
      yield* TestClock.setTime(DateTime.toEpochMillis(from) - 3_600_000);
      const memory = yield* makeInMemory({});
      const source = yield* makeSyoboiSchedule("0 millis").pipe(Effect.provide(syoboiAnswering(listing).layer));
      const layer = Layer.merge(memory.layer, ScheduleSources.layer([source]));

      expect((yield* syncSchedule().pipe(Effect.provide(layer))).updates).toBe(1);
      expect((yield* syncSchedule().pipe(Effect.provide(layer))).updates).toBe(0);
    }),
  );
});
