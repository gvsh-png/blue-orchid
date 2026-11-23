import type { ScheduledRelease } from "@blue-orchid/core";
import { Catalog, nextRelease, releasesBetween } from "@blue-orchid/core";
import type { Release, Show } from "@blue-orchid/domain";
import {
  Format as FormatSchema,
  ReleaseKind as ReleaseKindSchema,
  Region as RegionSchema,
  Season as SeasonSchema,
  ShowId,
  Status as StatusSchema,
} from "@blue-orchid/domain";
import { DateTime, Duration, Effect, Option } from "effect";

import { builder } from "./builder.ts";
import type { Viewer } from "./context.ts";
import { badInput, internal } from "./errors.ts";

/** Longest window one schedule query may ask for, so one request can't read the whole table. */
const maxWindow = Duration.days(31);

const ReleaseKind = builder.enumType("ReleaseKind", { values: ReleaseKindSchema.literals });
const Region = builder.enumType("Region", { values: RegionSchema.literals });
const Format = builder.enumType("Format", { values: FormatSchema.literals });
const Status = builder.enumType("Status", { values: StatusSchema.literals });
const Season = builder.enumType("Season", { values: SeasonSchema.literals });

const ShowRef = builder.objectRef<Show>("Show");
const ScheduledReleaseRef = builder.objectRef<ScheduledRelease>("ScheduledRelease");

ShowRef.implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    title: t.exposeString("title"),
    imageUrl: t.exposeString("imageUrl", { nullable: true }),
    episodes: t.exposeInt("episodes", { nullable: true }),
    format: t.field({ type: Format, nullable: true, resolve: (show) => show.format }),
    status: t.field({ type: Status, nullable: true, resolve: (show) => show.status }),
    season: t.field({ type: Season, nullable: true, resolve: (show) => show.season }),
    year: t.exposeInt("year", { nullable: true }),
    startDate: t.exposeString("startDate", { nullable: true }),
    endDate: t.exposeString("endDate", { nullable: true }),
    episodeMinutes: t.exposeInt("episodeMinutes", { nullable: true }),
    siteIds: t.idList({ resolve: (show) => show.siteIds }),
    releases: t.field({
      type: [ScheduledReleaseRef],
      resolve: (show, _, context) =>
        context.run(
          Catalog.use((catalog) => catalog.showReleases(show.id)).pipe(
            Effect.map((releases) => releases.map((release) => ({ show, release }))),
            Effect.mapError(internal),
          ),
        ),
    }),
    nextRelease: t.field({
      type: ScheduledReleaseRef,
      nullable: true,
      resolve: (show, _, context) =>
        context.run(
          nextRelease(show.id).pipe(
            Effect.map((release) => (release === undefined ? null : { show, release })),
            Effect.mapError(internal),
          ),
        ),
    }),
  }),
});

const ReleaseRef = builder.objectRef<Release>("Release").implement({
  fields: (t) => ({
    episode: t.exposeInt("episode"),
    kind: t.field({ type: ReleaseKind, resolve: (release) => release.kind }),
    region: t.field({ type: Region, resolve: (release) => release.region }),
    airsAt: t.string({
      description: "ISO 8601 time in UTC",
      resolve: (release) => DateTime.formatIso(release.airsAt),
    }),
  }),
});

ScheduledReleaseRef.implement({
  fields: (t) => ({
    show: t.field({ type: ShowRef, resolve: (row) => row.show }),
    release: t.field({ type: ReleaseRef, resolve: (row) => row.release }),
    endsAt: t.string({
      nullable: true,
      resolve: ({ show, release }) => {
        const endsAt = show.endsAt(release.airsAt);
        return endsAt === null ? null : DateTime.formatIso(endsAt);
      },
    }),
  }),
});

const ViewerRef = builder.objectRef<Viewer>("Viewer").implement({
  fields: (t) => ({ id: t.exposeID("id"), name: t.exposeString("name") }),
});

const instant = (name: string, value: string) =>
  Option.match(DateTime.make(value), {
    onNone: () => Effect.fail(badInput(`${name} is not an ISO 8601 time.`)),
    onSome: (time) => Effect.succeed(DateTime.toUtc(time)),
  });

builder.queryType({
  fields: (t) => ({
    schedule: t.field({
      type: [ScheduledReleaseRef],
      description: "Releases with from <= airsAt < to, earliest first. The window may be at most 31 days.",
      args: { from: t.arg.string({ required: true }), to: t.arg.string({ required: true }) },
      resolve: (_, args, context) =>
        context.run(
          Effect.gen(function* () {
            const from = yield* instant("from", args.from);
            const to = yield* instant("to", args.to);
            if (DateTime.isGreaterThan(to, DateTime.addDuration(from, maxWindow))) {
              return yield* Effect.fail(badInput("The window may be at most 31 days."));
            }
            return yield* releasesBetween(from, to).pipe(Effect.mapError(internal));
          }),
        ),
    }),
    show: t.field({
      type: ShowRef,
      nullable: true,
      args: { id: t.arg.id({ required: true }) },
      resolve: (_, args, context) =>
        context.run(
          Catalog.use((catalog) => catalog.show(ShowId.make(args.id))).pipe(
            Effect.catchTags({
              ShowNotFound: () => Effect.succeed(null),
              StoreFailed: () => Effect.fail(internal()),
            }),
          ),
        ),
    }),
    viewer: t.field({
      type: ViewerRef,
      nullable: true,
      description: "The signed-in user, or null.",
      resolve: (_, __, context) => context.viewer,
    }),
  }),
});

export const schema = builder.toSchema();
