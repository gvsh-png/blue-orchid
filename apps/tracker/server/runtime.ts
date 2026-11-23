import type { Job } from "@blue-orchid/core";
import type { GraphQLContext, Viewer } from "@blue-orchid/graphql";
import { makeGraphQLHandler } from "@blue-orchid/graphql";
import { Context, Effect, Layer, ManagedRuntime } from "effect";
import { HttpRouter, HttpServer } from "effect/http";

import { AppLive, RoutesLive } from "./AppLive.ts";

/** Shared by the runtime and the HTTP handler, so AppLive is built once per Worker instance. */
const memoMap = Layer.makeMemoMapUnsafe();

const runtime = ManagedRuntime.make(AppLive, { memoMap });

export const runJob = (name: string, job: Job) =>
  runtime.runPromise(
    job.run.pipe(
      Effect.tap((report) => Effect.logInfo("Job finished", { job: name, report })),
      Effect.withSpan(`job:${name}`),
    ),
  );

const graphql = makeGraphQLHandler({ explore: import.meta.env.DEV });

export const handleGraphQL = (request: Request, viewer: Viewer | null) => {
  const context: GraphQLContext = { run: (effect) => runtime.runPromise(effect), viewer };
  return graphql.fetch(request, context);
};

const http = HttpRouter.toWebHandler(RoutesLive.pipe(Layer.provide(AppLive), Layer.provide(HttpServer.layerServices)), {
  memoMap,
  disableLogger: true,
});

export const handleHttp = (request: Request) => http.handler(request, Context.empty());
