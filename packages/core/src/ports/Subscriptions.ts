import type { ChatIdentity, Show, ShowId, StoreFailed, Update, UpdateId } from "@blue-orchid/domain";
import type { Effect } from "effect";
import { Context } from "effect";

export interface PendingDelivery {
  readonly identity: ChatIdentity;
  readonly show: Show;
  readonly update: Update;
}

/** Who follows which show, and which updates each follower has been sent. */
export class Subscriptions extends Context.Service<
  Subscriptions,
  {
    readonly follow: (identity: ChatIdentity, show: ShowId) => Effect.Effect<void, StoreFailed>;
    /** Succeeds with false when the identity did not follow the show. */
    readonly unfollow: (identity: ChatIdentity, show: ShowId) => Effect.Effect<boolean, StoreFailed>;
    readonly followed: (identity: ChatIdentity) => Effect.Effect<ReadonlyArray<Show>, StoreFailed>;
    /** Updates detected after the follow began that the follower has not been sent, oldest first. */
    readonly pending: (limit: number) => Effect.Effect<ReadonlyArray<PendingDelivery>, StoreFailed>;
    readonly markDelivered: (update: UpdateId, identity: ChatIdentity) => Effect.Effect<void, StoreFailed>;
  }
>()("orchid/core/Subscriptions") {}
