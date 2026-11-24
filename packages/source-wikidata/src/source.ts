import type { CatalogSlice } from "@blue-orchid/core";
import { CatalogSource } from "@blue-orchid/core";
import type { Format, Season, Status } from "@blue-orchid/domain";
import { Show, SourceUnavailable } from "@blue-orchid/domain";
import { DateTime, Effect, Layer, Schedule, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

export const wikidataApi = "https://query.wikidata.org/sparql";

/** Wikidata's anime item types and the format each one means. */
const formats: Readonly<Record<string, Format | null>> = {
  Q63952888: "tv",
  Q100269041: "tv",
  Q20650540: "movie",
  Q220898: "ova",
  Q113687694: "ova",
  Q113671041: "ona",
  Q104775758: "special",
  Q1107: null,
};

/** Site id prefix → Wikidata property. The first one an item has becomes the show's id. */
const sites = [
  ["syoboi", "P11648"],
  ["anilist", "P8729"],
  ["myanimelist", "P4086"],
  ["anidb", "P5646"],
  ["kitsu", "P11495"],
  ["livechart", "P12489"],
  ["animenewsnetwork", "P1985"],
] as const;

const literal = (time: DateTime.Utc) => `"${DateTime.formatIso(time)}"^^xsd:dateTime`;

const filterFor = (slice: CatalogSlice, now: DateTime.Utc) => {
  switch (slice._tag) {
    case "Airing":
      return `FILTER(BOUND(?first) && ?first <= ${literal(now)} && ?first >= ${literal(DateTime.subtract(now, { years: 2 }))} && (!BOUND(?end) || ?end >= ${literal(now)}))`;
    case "Upcoming":
      return `FILTER(BOUND(?first) && ?first > ${literal(now)})`;
    case "Year":
      return `FILTER(BOUND(?first) && YEAR(?first) = ${slice.year})`;
  }
};

const queryFor = (slice: CatalogSlice, now: DateTime.Utc) => `
SELECT ?item ?itemLabel
  (GROUP_CONCAT(DISTINCT STRAFTER(STR(?type), "entity/"); separator=" ") AS ?types)
  (MAX(?episodes) AS ?episodeCount)
  (MIN(?first) AS ?startTime) (MAX(?firstPrecision) AS ?startPrecision)
  (MAX(?end) AS ?endTime) (MAX(?endPrecision) AS ?endPrecisionMax)
  ${sites.map(([site]) => `(SAMPLE(?${site}) AS ?${site}Id)`).join(" ")}
WHERE {
  VALUES ?type { ${Object.keys(formats)
    .map((id) => `wd:${id}`)
    .join(" ")} }
  ?item wdt:P31 ?type .
  OPTIONAL { ?item p:P580/psv:P580 [ wikibase:timeValue ?start; wikibase:timePrecision ?startPrecision ] }
  OPTIONAL { ?item p:P577/psv:P577 [ wikibase:timeValue ?published; wikibase:timePrecision ?publishedPrecision ] }
  OPTIONAL { ?item p:P582/psv:P582 [ wikibase:timeValue ?end; wikibase:timePrecision ?endPrecision ] }
  OPTIONAL { ?item wdt:P1113 ?episodes }
  ${sites.map(([site, property]) => `OPTIONAL { ?item wdt:${property} ?${site} }`).join("\n  ")}
  BIND(COALESCE(?start, ?published) AS ?first)
  BIND(COALESCE(?startPrecision, ?publishedPrecision) AS ?firstPrecision)
  ${filterFor(slice, now)}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ja,mul". }
}
GROUP BY ?item ?itemLabel
`;

const Value = Schema.Struct({ value: Schema.String });
const Answer = Schema.Struct({
  results: Schema.Struct({ bindings: Schema.Array(Schema.Record(Schema.String, Value)) }),
});
type Row = (typeof Answer.Type)["results"]["bindings"][number];

/** Wikidata precision 9 is a year, 10 a month, 11 a day. */
const partialDate = (time: string | undefined, precision: string | undefined) => {
  if (time === undefined) {
    return null;
  }
  const digits = Number(precision ?? "9") >= 11 ? 10 : Number(precision ?? "9") === 10 ? 7 : 4;
  return time.slice(0, digits);
};

const seasons = ["winter", "spring", "summer", "fall"] as const;

/** Quarters, except that a show starting in the second half of a quarter's last month opens the next season. */
const seasonOf = (date: string | null): Season | null => {
  if (date === null || date.length < 7) {
    return null;
  }
  const month = Number(date.slice(5, 7));
  const late = month % 3 === 0 && date.length === 10 && Number(date.slice(8, 10)) >= 15;
  return seasons[(Math.floor((month - 1) / 3) + (late ? 1 : 0)) % 4] ?? null;
};

const toShow = (row: Row, now: DateTime.Utc) => {
  const qid = (row["item"]?.value ?? "").split("/").at(-1) ?? "";
  const siteIds = [
    ...sites.flatMap(([site]) => {
      const id = row[`${site}Id`]?.value;
      return id === undefined ? [] : [`${site}:${id}`];
    }),
    `wikidata:${qid}`,
  ];
  const startDate = partialDate(row["startTime"]?.value, row["startPrecision"]?.value);
  const endDate = partialDate(row["endTime"]?.value, row["endPrecisionMax"]?.value);
  const nowIso = DateTime.formatIso(now);
  const start = row["startTime"]?.value;
  const end = row["endTime"]?.value;
  const twoYearsAgo = DateTime.formatIso(DateTime.subtract(now, { years: 2 }));
  // Old shows often have no end date, so only a recent start without an end counts as airing.
  const status: Status | null =
    end !== undefined && end <= nowIso
      ? "finished"
      : start !== undefined && start > nowIso
        ? "upcoming"
        : start !== undefined && start >= twoYearsAgo
          ? "airing"
          : null;
  const types = (row["types"]?.value ?? "").split(" ");
  const label = row["itemLabel"]?.value ?? "";
  const episodes = Number(row["episodeCount"]?.value);
  return Schema.decodeUnknownEffect(Show)({
    id: siteIds[0],
    // Without a label in any language Wikidata answers the item id itself.
    title: label === qid ? "" : label,
    imageUrl: null,
    episodes: Number.isInteger(episodes) ? episodes : null,
    format: types.map((type) => formats[type]).find((format) => format !== undefined && format !== null) ?? null,
    status,
    season: seasonOf(startDate),
    year: startDate === null ? null : Number(startDate.slice(0, 4)),
    startDate,
    endDate,
    episodeMinutes: null,
    siteIds,
  });
};

/** Every anime Wikidata knows, one catalog slice at a time. Wikidata is CC0: free to copy and keep. */
export const WikidataCatalogLive = Layer.effect(
  CatalogSource,
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.filterStatusOk,
      HttpClient.retryTransient({ schedule: Schedule.spaced("1 minute"), times: 2 }),
    );
    const fetch = Effect.fn("Wikidata.fetch")(function* (slice: CatalogSlice) {
      const now = yield* DateTime.now;
      const answer = yield* HttpClientRequest.get(wikidataApi).pipe(
        // Wikidata asks every client for a User-Agent with a way to reach its owner.
        HttpClientRequest.setHeader("User-Agent", "blue-orchid/0.1 (+https://github.com/noxaur/blue-orchid)"),
        HttpClientRequest.setHeader("Accept", "application/sparql-results+json"),
        HttpClientRequest.setUrlParams({ query: queryFor(slice, now) }),
        client.execute,
        Effect.flatMap(HttpClientResponse.schemaBodyJson(Answer)),
      );
      const [shows, skipped] = yield* Effect.partition(answer.results.bindings, (row) => toShow(row, now));
      if (skipped.length > 0) {
        yield* Effect.logWarning("Skipped Wikidata items the catalog can't hold", skipped.length);
      }
      return shows;
    });
    return CatalogSource.of({
      name: "wikidata",
      fetch: (slice) =>
        fetch(slice).pipe(Effect.mapError((cause) => new SourceUnavailable({ source: "wikidata", cause }))),
    });
  }),
);
