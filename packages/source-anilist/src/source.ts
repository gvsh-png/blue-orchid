import type { ScheduleSource } from "@blue-orchid/core";
import type { Format, Season, Status } from "@blue-orchid/domain";
import { Release, Show, ShowId, SourceUnavailable } from "@blue-orchid/domain";
import { DateTime, Effect, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

export const anilistApi = "https://graphql.anilist.co";

const query = /* GraphQL */ `
  query Schedule($page: Int!, $from: Int!, $to: Int!) {
    Page(page: $page, perPage: 50) {
      pageInfo {
        hasNextPage
      }
      airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
        episode
        airingAt
        media {
          id
          idMal
          isAdult
          title {
            english
            romaji
          }
          coverImage {
            large
          }
          episodes
          format
          status
          season
          seasonYear
          startDate {
            year
            month
            day
          }
          endDate {
            year
            month
            day
          }
          duration
        }
      }
    }
  }
`;

const FuzzyDate = Schema.Struct({
  year: Schema.NullOr(Schema.Int),
  month: Schema.NullOr(Schema.Int),
  day: Schema.NullOr(Schema.Int),
});

const Media = Schema.Struct({
  id: Schema.Int,
  idMal: Schema.NullOr(Schema.Int),
  isAdult: Schema.NullOr(Schema.Boolean),
  title: Schema.Struct({ english: Schema.NullOr(Schema.String), romaji: Schema.NullOr(Schema.String) }),
  coverImage: Schema.NullOr(Schema.Struct({ large: Schema.NullOr(Schema.String) })),
  episodes: Schema.NullOr(Schema.Int),
  format: Schema.NullOr(Schema.String),
  status: Schema.NullOr(Schema.String),
  season: Schema.NullOr(Schema.String),
  seasonYear: Schema.NullOr(Schema.Int),
  startDate: Schema.NullOr(FuzzyDate),
  endDate: Schema.NullOr(FuzzyDate),
  duration: Schema.NullOr(Schema.Int),
});

const SchedulePage = Schema.Struct({
  data: Schema.Struct({
    Page: Schema.Struct({
      pageInfo: Schema.Struct({ hasNextPage: Schema.Boolean }),
      airingSchedules: Schema.Array(Schema.Struct({ episode: Schema.Int, airingAt: Schema.Int, media: Media })),
    }),
  }),
});

const formats: Readonly<Record<string, Format>> = {
  TV: "tv",
  TV_SHORT: "tv",
  MOVIE: "movie",
  OVA: "ova",
  ONA: "ona",
  SPECIAL: "special",
};

const statuses: Readonly<Record<string, Status>> = {
  NOT_YET_RELEASED: "upcoming",
  RELEASING: "airing",
  FINISHED: "finished",
  HIATUS: "hiatus",
  CANCELLED: "cancelled",
};

const seasons: Readonly<Record<string, Season>> = {
  WINTER: "winter",
  SPRING: "spring",
  SUMMER: "summer",
  FALL: "fall",
};

const twoDigits = (value: number) => String(value).padStart(2, "0");

/** 2027, 2027-04 or 2027-04-05: as much as AniList knows. */
const partialDate = (date: typeof FuzzyDate.Type | null) => {
  if (date === null || date.year === null) {
    return null;
  }
  if (date.month === null) {
    return String(date.year);
  }
  return date.day === null
    ? `${date.year}-${twoDigits(date.month)}`
    : `${date.year}-${twoDigits(date.month)}-${twoDigits(date.day)}`;
};

const toShow = (media: typeof Media.Type) => {
  const id = ShowId.make(`anilist:${media.id}`);
  return new Show({
    id,
    title: media.title.english ?? media.title.romaji ?? `AniList ${media.id}`,
    imageUrl: media.coverImage?.large ?? null,
    episodes: media.episodes,
    format: formats[media.format ?? ""] ?? null,
    status: statuses[media.status ?? ""] ?? null,
    season: seasons[media.season ?? ""] ?? null,
    year: media.seasonYear,
    startDate: partialDate(media.startDate),
    endDate: partialDate(media.endDate),
    episodeMinutes: media.duration,
    siteIds: media.idMal === null ? [id] : [id, ShowId.make(`myanimelist:${media.idMal}`)],
  });
};

/** AniList's airing schedule: the Japanese broadcast of each episode, with each show's current details. */
export const makeAniListSource = Effect.gen(function* () {
  const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);

  const fetchPage = Effect.fn("AniList.fetchPage")(function* (page: number, from: DateTime.Utc, to: DateTime.Utc) {
    return yield* HttpClientRequest.post(anilistApi).pipe(
      HttpClientRequest.setHeader("User-Agent", "blue-orchid (anime release tracker)"),
      HttpClientRequest.bodyJsonUnsafe({
        query,
        variables: {
          page,
          // AniList compares in whole seconds and excludes both ends; -1 keeps a release at exactly `from`.
          from: Math.floor(DateTime.toEpochMillis(from) / 1000) - 1,
          to: Math.ceil(DateTime.toEpochMillis(to) / 1000),
        },
      }),
      client.execute,
      Effect.flatMap(HttpClientResponse.schemaBodyJson(SchedulePage)),
    );
  });

  const source: ScheduleSource = {
    name: "anilist",
    fetch: (from, to) =>
      Effect.gen(function* () {
        const shows = new Map<string, Show>();
        const releases: Array<Release> = [];
        for (let page = 1; ; page++) {
          const { data } = yield* fetchPage(page, from, to);
          for (const { episode, airingAt, media } of data.Page.airingSchedules) {
            if (media.isAdult === true) {
              continue;
            }
            const show = shows.get(`anilist:${media.id}`) ?? toShow(media);
            shows.set(show.id, show);
            releases.push(
              new Release({
                showId: show.id,
                episode,
                kind: "raw",
                region: "JP",
                airsAt: DateTime.makeUnsafe(airingAt * 1000),
              }),
            );
          }
          if (!data.Page.pageInfo.hasNextPage) {
            return { shows: [...shows.values()], releases };
          }
        }
      }).pipe(Effect.mapError((cause) => new SourceUnavailable({ source: "anilist", cause }))),
  };
  return source;
});
