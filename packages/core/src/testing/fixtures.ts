import { Release, Show, ShowId } from "@blue-orchid/domain";
import { DateTime } from "effect";

export const frieren = new Show({
  id: ShowId.make("anilist:154587"),
  title: "Frieren: Beyond Journey's End",
  imageUrl: null,
  episodes: 28,
});

export const release = (overrides: Partial<ConstructorParameters<typeof Release>[0]> = {}) =>
  new Release({
    showId: frieren.id,
    episode: 1,
    kind: "sub",
    region: "NO",
    airsAt: DateTime.makeUnsafe("2026-01-09T15:00:00Z"),
    ...overrides,
  });
