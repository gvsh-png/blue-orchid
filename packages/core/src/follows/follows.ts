import type { ChatIdentity } from "@blue-orchid/domain";
import { ShowNotFound } from "@blue-orchid/domain";
import { Effect } from "effect";

import { Catalog } from "../ports/Catalog.ts";
import { Subscriptions } from "../ports/Subscriptions.ts";

const bestMatch = Effect.fn("Follows.bestMatch")(function* (title: string) {
  const catalog = yield* Catalog;
  const [show] = yield* catalog.searchShows(title, 1);
  if (show === undefined) {
    return yield* new ShowNotFound({ query: title });
  }
  return show;
});

export const follow = Effect.fn("Follows.follow")(function* (identity: ChatIdentity, title: string) {
  const show = yield* bestMatch(title);
  const subscriptions = yield* Subscriptions;
  yield* subscriptions.follow(identity, show.id);
  return show;
});

export const unfollow = Effect.fn("Follows.unfollow")(function* (identity: ChatIdentity, title: string) {
  const show = yield* bestMatch(title);
  const subscriptions = yield* Subscriptions;
  const wasFollowing = yield* subscriptions.unfollow(identity, show.id);
  return { show, wasFollowing };
});

export const followed = Effect.fn("Follows.followed")(function* (identity: ChatIdentity) {
  const subscriptions = yield* Subscriptions;
  return yield* subscriptions.followed(identity);
});
