import { ChatIdentity, SourceUnavailable } from "@blue-orchid/domain";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Layer } from "effect";
import { TestClock } from "effect/testing";

import { deliverNotifications } from "../notifications/deliver.ts";
import { ScheduleSources } from "../ports/ScheduleSources.ts";
import { Subscriptions } from "../ports/Subscriptions.ts";
import { frieren, release } from "../testing/fixtures.ts";
import { makeInMemory } from "../testing/InMemory.ts";
import { syncSchedule } from "./sync.ts";

const reader = new ChatIdentity({ platform: "discord", userId: "1001" });

describe("syncSchedule then deliverNotifications", () => {
  it.effect("tells a follower once when an episode moves", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe("2026-01-05T00:00:00Z")));
      const memory = yield* makeInMemory({ shows: [frieren], releases: [release()] });
      const moved = release({ airsAt: DateTime.makeUnsafe("2026-01-09T16:30:00Z") });
      const sources = ScheduleSources.layer([
        { name: "broken", fetch: () => Effect.fail(new SourceUnavailable({ source: "broken", cause: "down" })) },
        { name: "fake", fetch: () => Effect.succeed({ shows: [frieren], releases: [moved] }) },
      ]);
      const layer = Layer.merge(memory.layer, sources);

      yield* Subscriptions.use((subscriptions) => subscriptions.follow(reader, frieren.id)).pipe(Effect.provide(layer));
      const report = yield* syncSchedule().pipe(Effect.provide(layer));
      expect(report).toEqual({ sources: 2, failedSources: 1, releases: 1, updates: 1 });

      yield* deliverNotifications().pipe(Effect.provide(layer));
      yield* syncSchedule().pipe(Effect.provide(layer));
      yield* deliverNotifications().pipe(Effect.provide(layer));

      const sent = yield* memory.sent;
      expect(sent).toHaveLength(1);
      expect(sent[0]?.userId).toBe("1001");
      expect(sent[0]?.message.text).toBe(`${frieren.title} has a new time.`);
    }),
  );
});
