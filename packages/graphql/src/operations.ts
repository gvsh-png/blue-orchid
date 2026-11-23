import { Format, PartialDate, Region, ReleaseKind, Season, Status } from "@blue-orchid/domain";
import { Schema } from "effect";

/**
 * Every query the website sends, with the shape of its answer. The website imports only this file.
 * A test in this package checks each document against the schema and decodes a real answer with `result`.
 */
export interface Operation<A> {
  readonly name: string;
  readonly document: string;
  readonly result: Schema.Codec<A, unknown>;
}

const ScheduleResult = Schema.Struct({
  schedule: Schema.Array(
    Schema.Struct({
      show: Schema.Struct({ id: Schema.String, title: Schema.String, imageUrl: Schema.NullOr(Schema.String) }),
      release: Schema.Struct({
        episode: Schema.Int,
        kind: ReleaseKind,
        region: Region,
        airsAt: Schema.DateTimeUtcFromString,
      }),
    }),
  ),
});

export const ScheduleQuery = {
  name: "Schedule",
  document: /* GraphQL */ `
    query Schedule($from: String!, $to: String!) {
      schedule(from: $from, to: $to) {
        show {
          id
          title
          imageUrl
        }
        release {
          episode
          kind
          region
          airsAt
        }
      }
    }
  `,
  result: ScheduleResult,
} satisfies Operation<typeof ScheduleResult.Type>;

const ReleaseResult = Schema.Struct({
  release: Schema.Struct({
    episode: Schema.Int,
    kind: ReleaseKind,
    region: Region,
    airsAt: Schema.DateTimeUtcFromString,
  }),
  endsAt: Schema.NullOr(Schema.DateTimeUtcFromString),
});

const ShowResult = Schema.Struct({
  show: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      imageUrl: Schema.NullOr(Schema.String),
      episodes: Schema.NullOr(Schema.Int),
      format: Schema.NullOr(Format),
      status: Schema.NullOr(Status),
      season: Schema.NullOr(Season),
      year: Schema.NullOr(Schema.Int),
      startDate: Schema.NullOr(PartialDate),
      endDate: Schema.NullOr(PartialDate),
      episodeMinutes: Schema.NullOr(Schema.Int),
      siteIds: Schema.Array(Schema.String),
      nextRelease: Schema.NullOr(ReleaseResult),
      releases: Schema.Array(ReleaseResult),
    }),
  ),
});

export const ShowQuery = {
  name: "Show",
  document: /* GraphQL */ `
    query Show($id: ID!) {
      show(id: $id) {
        id
        title
        imageUrl
        episodes
        format
        status
        season
        year
        startDate
        endDate
        episodeMinutes
        siteIds
        nextRelease {
          release {
            episode
            kind
            region
            airsAt
          }
          endsAt
        }
        releases {
          release {
            episode
            kind
            region
            airsAt
          }
          endsAt
        }
      }
    }
  `,
  result: ShowResult,
} satisfies Operation<typeof ShowResult.Type>;

const ViewerResult = Schema.Struct({
  viewer: Schema.NullOr(Schema.Struct({ id: Schema.String, name: Schema.String })),
});

export const ViewerQuery = {
  name: "Viewer",
  document: /* GraphQL */ `
    query Viewer {
      viewer {
        id
        name
      }
    }
  `,
  result: ViewerResult,
} satisfies Operation<typeof ViewerResult.Type>;

export const operations = [ScheduleQuery, ShowQuery, ViewerQuery] as const;
