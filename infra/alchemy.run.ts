import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import { Effect } from "effect";

/**
 * Cloud resources the app does not own. Void creates and deploys everything the app uses: its Worker, D1, KV,
 * R2, queues and crons (apps/tracker). Declare here only what Void does not, such as DNS or another cloud.
 * A lint rule stops Worker, D1 and site resources from being declared here.
 */
export default Alchemy.Stack(
  "blue-orchid-infra",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.succeed({}),
);
