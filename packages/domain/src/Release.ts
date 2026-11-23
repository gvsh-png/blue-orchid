import { Schema } from "effect";

import { ShowId } from "./ids.ts";

/** raw is the Japanese broadcast. sub and dub are the subtitled and dubbed releases on a streaming service. */
export const ReleaseKind = Schema.Literals(["raw", "sub", "dub"]);
export type ReleaseKind = typeof ReleaseKind.Type;

/** ISO 3166-1 alpha-2. JP is where raw releases air. Norway is the first region we cover. */
export const Region = Schema.Literals(["JP", "NO"]);
export type Region = typeof Region.Type;

export class Release extends Schema.Class<Release>("Release")({
  showId: ShowId,
  episode: Schema.Int,
  kind: ReleaseKind,
  region: Region,
  airsAt: Schema.DateTimeUtc,
}) {}

/** Two releases with the same key are the same episode drop, possibly at a different time. */
export const releaseKey = (release: Pick<Release, "showId" | "episode" | "kind" | "region">): string =>
  `${release.showId}:${release.episode}:${release.kind}:${release.region}`;
