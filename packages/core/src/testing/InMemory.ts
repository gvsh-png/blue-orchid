import type { ChatIdentity, Release, Show, ShowId, Update } from "@blue-orchid/domain";
import { releaseKey, ShowNotFound } from "@blue-orchid/domain";
import { DateTime, Effect, Layer, Ref } from "effect";

import type { Message } from "../chat/Message.ts";
import { Catalog } from "../ports/Catalog.ts";
import { Messengers } from "../ports/Messengers.ts";
import { Subscriptions } from "../ports/Subscriptions.ts";

interface Follow {
  readonly identity: ChatIdentity;
  readonly show: ShowId;
  readonly since: DateTime.Utc;
}

export interface SentMessage {
  readonly userId: string;
  readonly message: Message;
}

const identityKey = (identity: ChatIdentity) => `${identity.platform}:${identity.userId}`;

/** In-memory Catalog, Subscriptions and Messengers for tests. `sent` holds every message the messengers sent. */
export const makeInMemory = Effect.fn("InMemory.make")(function* (seed: {
  readonly shows?: ReadonlyArray<Show>;
  readonly releases?: ReadonlyArray<Release>;
}) {
  const shows = yield* Ref.make(new Map((seed.shows ?? []).map((show) => [show.id, show])));
  const releases = yield* Ref.make(new Map((seed.releases ?? []).map((release) => [releaseKey(release), release])));
  const updates = yield* Ref.make(new Map<string, Update>());
  const follows = yield* Ref.make<ReadonlyArray<Follow>>([]);
  const delivered = yield* Ref.make(new Set<string>());
  const sent = yield* Ref.make<ReadonlyArray<SentMessage>>([]);

  const catalog = Catalog.of({
    releasesBetween: Effect.fn("InMemory.releasesBetween")(function* (from, to) {
      const byId = yield* Ref.get(shows);
      const all = yield* Ref.get(releases);
      return [...all.values()]
        .filter((release) => DateTime.between(release.airsAt, { minimum: from, maximum: to }))
        .toSorted((a, b) => DateTime.toEpochMillis(a.airsAt) - DateTime.toEpochMillis(b.airsAt))
        .flatMap((release) => {
          const show = byId.get(release.showId);
          return show === undefined ? [] : [{ show, release }];
        });
    }),
    show: (id) =>
      Ref.get(shows).pipe(
        Effect.flatMap((byId) => {
          const show = byId.get(id);
          return show === undefined ? Effect.fail(new ShowNotFound({ query: id })) : Effect.succeed(show);
        }),
      ),
    searchShows: (title, limit) =>
      Ref.get(shows).pipe(
        Effect.map((byId) =>
          [...byId.values()].filter((show) => show.title.toLowerCase().includes(title.toLowerCase())).slice(0, limit),
        ),
      ),
    releasesByKey: (keys) => Ref.get(releases).pipe(Effect.map((all) => keys.flatMap((key) => all.get(key) ?? []))),
    save: (changes) =>
      Effect.all([
        Ref.update(shows, (byId) => new Map([...byId, ...changes.shows.map((show) => [show.id, show] as const)])),
        Ref.update(
          releases,
          (all) => new Map([...all, ...changes.releases.map((release) => [releaseKey(release), release] as const)]),
        ),
        Ref.update(
          updates,
          (all) =>
            new Map([
              ...changes.updates.filter((update) => !all.has(update.id)).map((u) => [u.id, u] as const),
              ...all,
            ]),
        ),
      ]).pipe(Effect.asVoid),
  });

  const subscriptions = Subscriptions.of({
    follow: Effect.fn("InMemory.follow")(function* (identity, show) {
      const since = yield* DateTime.now;
      yield* Ref.update(follows, (all) =>
        all.some((f) => identityKey(f.identity) === identityKey(identity) && f.show === show)
          ? all
          : [...all, { identity, show, since }],
      );
    }),
    unfollow: (identity, show) =>
      Ref.modify(follows, (all) => {
        const rest = all.filter((f) => !(identityKey(f.identity) === identityKey(identity) && f.show === show));
        return [rest.length < all.length, rest];
      }),
    followed: Effect.fn("InMemory.followed")(function* (identity) {
      const byId = yield* Ref.get(shows);
      const all = yield* Ref.get(follows);
      return all
        .filter((f) => identityKey(f.identity) === identityKey(identity))
        .flatMap((f) => byId.get(f.show) ?? []);
    }),
    pending: Effect.fn("InMemory.pending")(function* (limit) {
      const byId = yield* Ref.get(shows);
      const all = [...(yield* Ref.get(updates)).values()];
      const done = yield* Ref.get(delivered);
      return (yield* Ref.get(follows))
        .flatMap((f) =>
          all
            .filter(
              (update) =>
                update.change.release.showId === f.show &&
                DateTime.isGreaterThanOrEqualTo(update.detectedAt, f.since) &&
                !done.has(`${update.id}|${identityKey(f.identity)}`),
            )
            .flatMap((update) => {
              const show = byId.get(f.show);
              return show === undefined ? [] : [{ identity: f.identity, show, update }];
            }),
        )
        .slice(0, limit);
    }),
    markDelivered: (update, identity) =>
      Ref.update(delivered, (done) => new Set([...done, `${update}|${identityKey(identity)}`])),
  });

  const recording = {
    send: (userId: string, message: Message) => Ref.update(sent, (all) => [...all, { userId, message }]),
  };
  const messengers = Messengers.of({ discord: recording });

  return {
    layer: Layer.mergeAll(
      Layer.succeed(Catalog, catalog),
      Layer.succeed(Subscriptions, subscriptions),
      Layer.succeed(Messengers, messengers),
    ),
    sent: Ref.get(sent),
    updates: Ref.get(updates).pipe(Effect.map((all) => [...all.values()])),
  };
});
