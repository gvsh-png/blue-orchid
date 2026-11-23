import type { ScheduledRelease } from "@blue-orchid/core";
import { Catalog, releasesBetween } from "@blue-orchid/core";
import type { Release, Show } from "@blue-orchid/domain";
import { ReleaseKind as ReleaseKindSchema, Region as RegionSchema, ShowId } from "@blue-orchid/domain";
import { DateTime, Duration, Effect, Option } from "effect";

import { builder } from "./builder.ts";
import type { Viewer } from "./context.ts";
import { badInput, internal } from "./errors.ts";

/** Longest window one schedule query may ask for, so one request can't read the whole table. */
const maxWindow = Duration.days(31);

const ReleaseKind = builder.enumType("ReleaseKind", { values: ReleaseKindSchema.literals });
const Region = builder.enumType("Region", { values: RegionSchema.literals });

const ShowRef = builder.objectRef<Show>("Show").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    title: t.exposeString("title"),
    imageUrl: t.exposeString("imageUrl", { nullable: true }),
    episodes: t.exposeInt("episodes", { nullable: true }),
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

const ScheduledReleaseRef = builder.objectRef<ScheduledRelease>("ScheduledRelease").implement({
  fields: (t) => ({
    show: t.field({ type: ShowRef, resolve: (row) => row.show }),
    release: t.field({ type: ReleaseRef, resolve: (row) => row.release }),
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
