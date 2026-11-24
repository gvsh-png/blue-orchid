import type { CatalogSlice, ScheduleSource } from "@blue-orchid/core";
import { CatalogSource } from "@blue-orchid/core";
import type { Format, Season, Status } from "@blue-orchid/domain";
import { Release, Show, SourceUnavailable } from "@blue-orchid/domain";
import { DateTime, Effect, Layer, Schedule, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

export const anilistApi = "https://graphql.anilist.co";

const query = /* GraphQL */ `
  query Catalog(
    $page: Int!
    $status: MediaStatus
    $statusIn: [MediaStatus]
    $from: FuzzyDateInt
    $to: FuzzyDateInt
    $withEpisodes: Boolean = false
  ) {
    Page(page: $page, perPage: 50) {
      pageInfo {
        hasNextPage
      }
      media(
        type: ANIME
        isAdult: false
        sort: ID
        status: $status
        status_in: $statusIn
        startDate_greater: $from
        startDate_lesser: $to
      ) {
        id
        idMal
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
        airingSchedule(notYetAired: true, perPage: 25) @include(if: $withEpisodes) {
          nodes {
            episode
            airingAt
          }
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
  airingSchedule: Schema.optionalKey(
    Schema.Struct({ nodes: Schema.Array(Schema.Struct({ episode: Schema.Int, airingAt: Schema.Int })) }),
  ),
});

const CatalogPage = Schema.Struct({
  data: Schema.Struct({
    Page: Schema.Struct({ pageInfo: Schema.Struct({ hasNextPage: Schema.Boolean }), media: Schema.Array(Media) }),
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

/** Decoded, so a show AniList describes in a way the catalog can't hold fails here instead of throwing. */
const toShow = (media: typeof Media.Type) => {
  const id = `anilist:${media.id}`;
  return Schema.decodeUnknownEffect(Show)({
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
    siteIds: media.idMal === null ? [id] : [id, `myanimelist:${media.idMal}`],
  });
};

/** AniList filters by FuzzyDateInt, YYYYMMDD, with 0 for an unknown month or day. */
const variablesFor = (slice: CatalogSlice) => {
  switch (slice._tag) {
    case "Airing":
      return { status: "RELEASING" };
    case "Upcoming":
      return { status: "NOT_YET_RELEASED" };
    case "Year":
      return { from: slice.year * 10_000 - 1, to: (slice.year + 1) * 10_000 };
  }
};

const makeClient = Effect.map(HttpClient.HttpClient, (client) =>
  client.pipe(
    HttpClient.filterStatusOk,
    // AniList answers 429 past about 30 to 90 requests a minute, and a year can take 40 pages.
    HttpClient.retryTransient({ schedule: Schedule.spaced("1 minute"), times: 2 }),
  ),
);

/** Every page of the shows matching `variables`. */
const allMedia = Effect.fn("AniList.allMedia")(function* (
  client: HttpClient.HttpClient,
  variables: Readonly<Record<string, unknown>>,
) {
  const media: Array<typeof Media.Type> = [];
  for (let page = 1; ; page++) {
    const { data } = yield* HttpClientRequest.post(anilistApi).pipe(
      HttpClientRequest.setHeader("User-Agent", "blue-orchid (anime release tracker)"),
      HttpClientRequest.bodyJsonUnsafe({ query, variables: { page, ...variables } }),
      client.execute,
      Effect.flatMap(HttpClientResponse.schemaBodyJson(CatalogPage)),
    );
    media.push(...data.Page.media);
    if (!data.Page.pageInfo.hasNextPage) {
      return media;
    }
  }
});

const toShows = Effect.fn("AniList.toShows")(function* (media: ReadonlyArray<typeof Media.Type>) {
  const [fitting, skipped] = yield* Effect.partition(media, (one) =>
    toShow(one).pipe(Effect.map((show) => ({ show, media: one }))),
  );
  if (skipped.length > 0) {
    yield* Effect.logWarning("Skipped AniList shows the catalog can't hold", skipped);
  }
  return fitting;
});

const unavailable = (cause: unknown) => new SourceUnavailable({ source: "anilist", cause });

/** Every anime on AniList, one catalog slice at a time. */
export const AniListCatalogLive = Layer.effect(
  CatalogSource,
  Effect.gen(function* () {
    const client = yield* makeClient;
    return CatalogSource.of({
      name: "anilist",
      fetch: (slice) =>
        allMedia(client, variablesFor(slice)).pipe(
          Effect.flatMap(toShows),
          Effect.map((rows) => rows.map((row) => row.show)),
          Effect.mapError(unavailable),
        ),
    });
  }),
);

/** The coming Japanese broadcasts of every airing or announced show. */
export const makeAniListSchedule = Effect.gen(function* () {
  const client = yield* makeClient;
  const source: ScheduleSource = {
    name: "anilist",
    fetch: (from, to) =>
      allMedia(client, { statusIn: ["RELEASING", "NOT_YET_RELEASED"], withEpisodes: true }).pipe(
        Effect.flatMap(toShows),
        Effect.map((rows) => {
          const releases = rows.flatMap(({ show, media }) =>
            (media.airingSchedule?.nodes ?? [])
              .map(
                ({ episode, airingAt }) =>
                  new Release({
                    showId: show.id,
                    episode,
                    kind: "raw",
                    region: "JP",
                    airsAt: DateTime.makeUnsafe(airingAt * 1000),
                  }),
              )
              .filter(
                (release) =>
                  DateTime.isGreaterThanOrEqualTo(release.airsAt, from) && DateTime.isLessThan(release.airsAt, to),
              ),
          );
          const scheduled = new Set(releases.map((release) => release.showId));
          return { shows: rows.map((row) => row.show).filter((show) => scheduled.has(show.id)), releases };
        }),
        Effect.mapError(unavailable),
      ),
  };
  return source;
});
