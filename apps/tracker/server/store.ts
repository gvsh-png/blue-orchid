import { Catalog, claimLease, maxAttempts, Subscriptions } from "@blue-orchid/core";
import type { ChatIdentity } from "@blue-orchid/domain";
import {
  ChangeJson,
  ChatIdentity as ChatIdentitySchema,
  Release,
  releaseKey,
  Show,
  ShowNotFound,
  StoreFailed,
  Update,
} from "@blue-orchid/domain";
import { DateTime, Duration, Effect, Layer, Schema } from "effect";
import { and, asc, db, eq, gte, inArray, isNull, lt, lte, or, sql } from "void/db";

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
        .where(and(gte(releases.airsAt, DateTime.toEpochMillis(from)), lt(releases.airsAt, DateTime.toEpochMillis(to))))
        .orderBy(asc(releases.airsAt))
        .limit(1000),
    ).pipe(
      Effect.flatMap((rows) =>
        Effect.forEach(rows, (row) => Effect.all({ show: toShow(row.show), release: toRelease(row.release) })),
      ),
    ),
  show: Effect.fn("Catalog.show")(function* (id) {
    const [byId] = yield* query("show", () => db.select().from(shows).where(eq(shows.id, id)).limit(1));
    // Only another site's id gets here. It scans site_ids, which is fine at catalog size.
    const [row] =
      byId === undefined
        ? yield* query("show by site id", () =>
            db
              .select()
              .from(shows)
              .where(sql`EXISTS (SELECT 1 FROM json_each(${shows.siteIds}) WHERE json_each.value = ${id})`)
              .limit(1),
          )
        : [byId];
    if (row === undefined) {
      return yield* new ShowNotFound({ query: id });
    }
    return yield* toShow(row);
  }),
  showReleases: (id) =>
    query("showReleases", () =>
      db.select().from(releases).where(eq(releases.showId, id)).orderBy(asc(releases.airsAt)).limit(1000),
    ).pipe(Effect.flatMap((rows) => Effect.forEach(rows, toRelease))),
  nextRelease: (id, from) =>
    query("nextRelease", () =>
      db
        .select()
        .from(releases)
        .where(and(eq(releases.showId, id), gte(releases.airsAt, DateTime.toEpochMillis(from))))
        .orderBy(asc(releases.airsAt))
        .limit(1),
    ).pipe(Effect.flatMap(([row]) => (row === undefined ? Effect.succeed(undefined) : toRelease(row)))),
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
    ).pipe(
      Effect.flatMap((batches) =>
        Effect.forEach(batches.flat(), (row) =>
          toRelease(row).pipe(Effect.map((release) => ({ release, revision: row.revision }))),
        ),
      ),
    ),
  save: Effect.fn("Catalog.save")(function* (changes) {
    const updateRows = yield* Effect.forEach(changes.updates, (update) =>
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
    const statements = [
      // 12 columns a show, so 8 shows stay under D1's 100 bound values.
      ...chunks(changes.shows, 8).map((batch) =>
        db
          .insert(shows)
          .values(
            batch.map((show) => ({
              id: show.id,
              title: show.title,
              imageUrl: show.imageUrl,
              episodes: show.episodes,
              format: show.format,
              status: show.status,
              season: show.season,
              year: show.year,
              startDate: show.startDate,
              endDate: show.endDate,
              episodeMinutes: show.episodeMinutes,
              siteIds: [...show.siteIds],
            })),
          )
          .onConflictDoUpdate({
            target: shows.id,
            set: {
              title: sql`excluded.title`,
              imageUrl: sql`excluded.image_url`,
              episodes: sql`excluded.episodes`,
              format: sql`excluded.format`,
              status: sql`excluded.status`,
              season: sql`excluded.season`,
              year: sql`excluded.year`,
              startDate: sql`excluded.start_date`,
              endDate: sql`excluded.end_date`,
              episodeMinutes: sql`excluded.episode_minutes`,
              siteIds: sql`excluded.site_ids`,
            },
          }),
      ),
      ...chunks(changes.releases, 12).map((batch) =>
        db
          .insert(releases)
          .values(
            batch.map(({ release, revision }) => ({
              key: releaseKey(release),
              showId: release.showId,
              episode: release.episode,
              kind: release.kind,
              region: release.region,
              airsAt: DateTime.toEpochMillis(release.airsAt),
              revision,
            })),
          )
          .onConflictDoUpdate({
            target: releases.key,
            set: { airsAt: sql`excluded.airs_at`, revision: sql`excluded.revision` },
            // A run that read an older revision changes nothing, and its update id already exists, so the release
            // and its update stay a matching pair. The next sync sees the newer time and records it.
            setWhere: sql`${releases.revision} < excluded.revision`,
          }),
      ),
      ...chunks(updateRows, 20).map((batch) =>
        db
          .insert(updates)
          .values([...batch])
          .onConflictDoNothing(),
      ),
    ];
    const [first, ...rest] = statements;
    if (first === undefined) {
      return;
    }
    // One D1 batch is one transaction: a release is never stored without the update it caused.
    yield* query("save", () => db.batch([first, ...rest]));
  }),
});

const sameIdentity = (identity: ChatIdentity) =>
  and(eq(follows.platform, identity.platform), eq(follows.userId, identity.userId));

const deliveryOf = (update: string, identity: ChatIdentity) =>
  and(
    eq(deliveries.updateId, update),
    eq(deliveries.platform, identity.platform),
    eq(deliveries.userId, identity.userId),
  );

const leaseMillis = Duration.toMillis(claimLease);

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
  claim: Effect.fn("Subscriptions.claim")(function* (limit) {
    const now = DateTime.toEpochMillis(yield* DateTime.now);
    const stale = now - leaseMillis;
    const candidates = yield* query("claim candidates", () =>
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
        .where(
          or(
            isNull(deliveries.updateId),
            and(
              eq(deliveries.status, "claimed"),
              lte(deliveries.claimedAt, stale),
              lt(deliveries.attempts, maxAttempts),
            ),
          ),
        )
        .orderBy(asc(updates.detectedAt))
        .limit(limit),
    );
    // Each claim is a conditional upsert. Only one of two overlapping runs gets a row back, and only it sends.
    const claims = candidates.map((row) =>
      db
        .insert(deliveries)
        .values({
          updateId: row.update.id,
          platform: row.platform,
          userId: row.userId,
          status: "claimed",
          attempts: 1,
          claimedAt: now,
        })
        .onConflictDoUpdate({
          target: [deliveries.updateId, deliveries.platform, deliveries.userId],
          set: { attempts: sql`${deliveries.attempts} + 1`, claimedAt: now },
          setWhere: sql`${deliveries.status} = 'claimed' AND ${deliveries.claimedAt} <= ${stale} AND ${deliveries.attempts} < ${maxAttempts}`,
        })
        .returning({ updateId: deliveries.updateId }),
    );
    const [first, ...rest] = claims;
    const won = first === undefined ? [] : yield* query("claim", () => db.batch([first, ...rest]));
    const claimed = candidates.filter((_, index) => (won[index]?.length ?? 0) > 0);
    return yield* Effect.forEach(claimed, (row) =>
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
    );
  }),
  markSent: Effect.fn("Subscriptions.markSent")(function* (update, identity) {
    const deliveredAt = DateTime.toEpochMillis(yield* DateTime.now);
    yield* query("markSent", () =>
      db.update(deliveries).set({ status: "sent", deliveredAt }).where(deliveryOf(update, identity)),
    );
  }),
  markFailed: (update, identity, permanent) =>
    query("markFailed", () =>
      db
        .update(deliveries)
        .set({ status: "failed" })
        .where(
          permanent
            ? deliveryOf(update, identity)
            : and(deliveryOf(update, identity), gte(deliveries.attempts, maxAttempts)),
        ),
    ).pipe(Effect.asVoid),
});

/** Catalog and Subscriptions on the app's D1 database, through Void's Drizzle client. */
export const StoreLive = Layer.mergeAll(Layer.succeed(Catalog, catalog), Layer.succeed(Subscriptions, subscriptions));
