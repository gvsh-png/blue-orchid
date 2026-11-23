import { Effect, Result } from "effect";

import { Messengers } from "../ports/Messengers.ts";
import { Subscriptions } from "../ports/Subscriptions.ts";
import { updateMessage } from "./updateMessage.ts";

/** A batch small enough to finish inside one cron run. The rest wait for the next run. */
const batchSize = 100;

/** Sends each pending update to its follower. A failed send stays pending and is tried again on the next run. */
export const deliverNotifications = Effect.fn("Notifications.deliver")(function* () {
  const subscriptions = yield* Subscriptions;
  const messengers = yield* Messengers;
  const pending = yield* subscriptions.pending(batchSize);
  const results = yield* Effect.forEach(
    pending,
    (delivery) =>
      messengers[delivery.identity.platform]
        .send(delivery.identity.userId, updateMessage(delivery.show, delivery.update))
        .pipe(
          Effect.andThen(subscriptions.markDelivered(delivery.update.id, delivery.identity)),
          Effect.tapError((error) => Effect.logWarning("Notification not delivered", error)),
          Effect.result,
        ),
    { concurrency: 4 },
  );
  return { attempted: results.length, failed: results.filter(Result.isFailure).length };
});
