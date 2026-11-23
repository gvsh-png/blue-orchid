import { DateTime, Schema } from "effect";

import { ShowId } from "./ids.ts";

export const Format = Schema.Literals(["tv", "movie", "ova", "ona", "special"]);
export type Format = typeof Format.Type;

export const Status = Schema.Literals(["upcoming", "airing", "finished", "hiatus", "cancelled"]);
export type Status = typeof Status.Type;

export const Season = Schema.Literals(["winter", "spring", "summer", "fall"]);
export type Season = typeof Season.Type;

export const PartialDate = Schema.String.check(Schema.isPattern(/^\d{4}(-\d{2}(-\d{2})?)?$/));

export class Show extends Schema.Class<Show>("Show")(
  Schema.Struct({
    id: ShowId,
    title: Schema.NonEmptyString,
    imageUrl: Schema.NullOr(Schema.String),
    episodes: Schema.NullOr(Schema.Int),
    format: Schema.NullOr(Format),
    status: Schema.NullOr(Status),
    season: Schema.NullOr(Season),
    year: Schema.NullOr(Schema.Int),
    startDate: Schema.NullOr(PartialDate),
    endDate: Schema.NullOr(PartialDate),
    episodeMinutes: Schema.NullOr(Schema.Int),
    siteIds: Schema.Array(ShowId),
  }).check(
    Schema.makeFilter((show) => show.siteIds.includes(show.id) || "A show's own id must be one of its site ids."),
  ),
) {
  /** When an episode of this show that airs at `airsAt` ends, or null when its length is unknown. */
  endsAt(airsAt: DateTime.Utc): DateTime.Utc | null {
    return this.episodeMinutes === null ? null : DateTime.add(airsAt, { minutes: this.episodeMinutes });
  }
}
