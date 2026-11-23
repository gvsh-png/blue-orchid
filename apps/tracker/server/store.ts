import { Catalog, Subscriptions } from "@blue-orchid/core";
import type { ChatIdentity } from "@blue-orchid/domain";
import {
  Change,
  ChatIdentity as ChatIdentitySchema,
  Release,
  releaseKey,
  Show,
  ShowNotFound,
  StoreFailed,
  Update,
} from "@blue-orchid/domain";
import { DateTime, Effect, Layer, Schema } from "effect";
import { and, asc, db, eq, gte, inArray, isNull, lte, sql } from "void/db";

import { deliveries, follows, releases, shows, updates } from "../db/schema.ts";

/** D1 binds at most 100 values per statement, so writes and IN lists go in chunks. */
const chunks = <A>(items: ReadonlyArray<A>, size: number): ReadonlyArray<ReadonlyArray<A>> =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

const query = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => new StoreFailed({ operation, cause }) });

const decode =
  <S extends Schema.Decoder<unknown>>(schema: S, operation: string) =>
  (input: unknown) =>
    Schema.decodeUnknownEffect(schema)(input).pipe(Effect.mapError((cause) => new StoreFailed({ operation, cause })));

const ChangeJson = Schema.fromJsonString(Change);

type ShowRow = typeof shows.$inferSelect;
type ReleaseRow = typeof releases.$inferSelect;

const toShow = (row: ShowRow) => decode(Show, "decode show")(row);
const toRelease = (row: ReleaseRow) =>
  decode(Release, "decode release")({ ...row, airsAt: DateTime.makeUnsafe(row.airsAt) });

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

const catalog = Catalog.of({
  releasesBetween: (from, to) =>
    query("releasesBetween", () =>
      db
        .select({ show: shows, release: releases })
        .from(releases)
        .innerJoin(shows, eq(shows.id, releases.showId))
        .where(
          and(gte(releases.airsAt, DateTime.toEpochMillis(from)), lte(releases.airsAt, DateTime.toEpochMillis(to))),
        )
        .orderBy(asc(releases.airsAt))
        .limit(1000),
    ).pipe(
      Effect.flatMap((rows) =>
        Effect.forEach(rows, (row) => Effect.all({ show: toShow(row.show), release: toRelease(row.release) })),
      ),
    ),
  show: Effect.fn("Catalog.show")(function* (id) {
    const [row] = yield* query("show", () => db.select().from(shows).where(eq(shows.id, id)).limit(1));
    if (row === undefined) {
      return yield* new ShowNotFound({ query: id });
    }
    return yield* toShow(row);
  }),
  searchShows: (title, limit) =>
    query("searchShows", () =>
      db
        .select()
        .from(shows)
        .where(sql`${shows.title} LIKE ${`%${escapeLike(title)}%`} ESCAPE '\\'`)
        .orderBy(sql`length(${shows.title})`)
        .limit(limit),
    ).pipe(Effect.flatMap((rows) => Effect.forEach(rows, toShow))),
  releasesByKey: (keys) =>
    Effect.forEach(chunks(keys, 90), (batch) =>
      query("releasesByKey", () =>
        db
          .select()
          .from(releases)
          .where(inArray(releases.key, [...batch])),
      ),
    ).pipe(Effect.flatMap((batches) => Effect.forEach(batches.flat(), toRelease))),
  save: Effect.fn("Catalog.save")(function* (changes) {
    for (const batch of chunks(changes.shows, 20)) {
      yield* query("save shows", () =>
        db
          .insert(shows)
          .values(
            batch.map((show) => ({
              id: show.id,
              title: show.title,
              imageUrl: show.imageUrl,
              episodes: show.episodes,
            })),
          )
          .onConflictDoUpdate({
            target: shows.id,
            set: { title: sql`excluded.title`, imageUrl: sql`excluded.image_url`, episodes: sql`excluded.episodes` },
          }),
      );
    }
    for (const batch of chunks(changes.releases, 14)) {
      yield* query("save releases", () =>
        db
          .insert(releases)
          .values(
            batch.map((release) => ({
              key: releaseKey(release),
              showId: release.showId,
              episode: release.episode,
              kind: release.kind,
              region: release.region,
              airsAt: DateTime.toEpochMillis(release.airsAt),
            })),
          )
          .onConflictDoUpdate({ target: releases.key, set: { airsAt: sql`excluded.airs_at` } }),
      );
    }
    for (const batch of chunks(changes.updates, 20)) {
      const rows = yield* Effect.forEach(batch, (update) =>
        Schema.encodeEffect(ChangeJson)(update.change).pipe(
          Effect.mapError((cause) => new StoreFailed({ operation: "encode update", cause })),
          Effect.map((change) => ({
            id: update.id,
            showId: update.change.release.showId,
            detectedAt: DateTime.toEpochMillis(update.detectedAt),
            change,
          })),
        ),
      );
      yield* query("save updates", () => db.insert(updates).values(rows).onConflictDoNothing());
    }
  }),
});

const sameIdentity = (identity: ChatIdentity) =>
  and(eq(follows.platform, identity.platform), eq(follows.userId, identity.userId));

const subscriptions = Subscriptions.of({
  follow: Effect.fn("Subscriptions.follow")(function* (identity, show) {
    const since = DateTime.toEpochMillis(yield* DateTime.now);
    yield* query("follow", () =>
      db
        .insert(follows)
        .values({ platform: identity.platform, userId: identity.userId, showId: show, since })
        .onConflictDoNothing(),
    );
  }),
  unfollow: (identity, show) =>
    query("unfollow", () =>
      db
        .delete(follows)
        .where(and(sameIdentity(identity), eq(follows.showId, show)))
        .returning({ showId: follows.showId }),
    ).pipe(Effect.map((rows) => rows.length > 0)),
  followed: (identity) =>
    query("followed", () =>
      db
        .select({ show: shows })
        .from(follows)
        .innerJoin(shows, eq(shows.id, follows.showId))
        .where(sameIdentity(identity))
        .orderBy(asc(shows.title)),
    ).pipe(Effect.flatMap((rows) => Effect.forEach(rows, (row) => toShow(row.show)))),
  pending: (limit) =>
    query("pending", () =>
      db
        .select({ platform: follows.platform, userId: follows.userId, show: shows, update: updates })
        .from(follows)
        .innerJoin(updates, and(eq(updates.showId, follows.showId), gte(updates.detectedAt, follows.since)))
        .innerJoin(shows, eq(shows.id, follows.showId))
        .leftJoin(
          deliveries,
          and(
            eq(deliveries.updateId, updates.id),
            eq(deliveries.platform, follows.platform),
            eq(deliveries.userId, follows.userId),
          ),
        )
        .where(isNull(deliveries.updateId))
        .orderBy(asc(updates.detectedAt))
        .limit(limit),
    ).pipe(
      Effect.flatMap((rows) =>
        Effect.forEach(rows, (row) =>
          Effect.all({
            identity: decode(ChatIdentitySchema, "decode identity")({ platform: row.platform, userId: row.userId }),
            show: toShow(row.show),
            update: Schema.decodeEffect(ChangeJson)(row.update.change).pipe(
              Effect.mapError((cause) => new StoreFailed({ operation: "decode update", cause })),
              Effect.flatMap((change) =>
                decode(
                  Update,
                  "decode update",
                )({
                  id: row.update.id,
                  detectedAt: DateTime.makeUnsafe(row.update.detectedAt),
                  change,
                }),
              ),
            ),
          }),
        ),
      ),
    ),
  markDelivered: Effect.fn("Subscriptions.markDelivered")(function* (update, identity) {
    const deliveredAt = DateTime.toEpochMillis(yield* DateTime.now);
    yield* query("markDelivered", () =>
      db
        .insert(deliveries)
        .values({ updateId: update, platform: identity.platform, userId: identity.userId, deliveredAt })
        .onConflictDoNothing(),
    );
  }),
});

/** Catalog and Subscriptions on the app's D1 database, through Void's Drizzle client. */
export const StoreLive = Layer.mergeAll(Layer.succeed(Catalog, catalog), Layer.succeed(Subscriptions, subscriptions));
