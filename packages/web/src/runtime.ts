import { ManagedRuntime } from "effect";
import { FetchHttpClient } from "effect/http";

/** The website's only runtime. Route loaders call `run`; components never run Effects themselves. */
const runtime = ManagedRuntime.make(FetchHttpClient.layer);

export const run = runtime.runPromise;
