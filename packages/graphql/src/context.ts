import type { Catalog } from "@blue-orchid/core";
import type { Effect } from "effect";
import type { GraphQLError } from "graphql";

export type GraphQLServices = Catalog;

/** The signed-in website user, from Better Auth. Bots never reach GraphQL. */
export interface Viewer {
  readonly id: string;
  readonly name: string;
}

/**
 * What every resolver gets. `run` is supplied by the app, which owns the runtime, so this package never runs an
 * Effect itself. A resolver turns domain errors into GraphQLErrors before it calls `run`.
 */
export interface GraphQLContext {
  readonly run: <A>(effect: Effect.Effect<A, GraphQLError, GraphQLServices>) => Promise<A>;
  readonly viewer: Viewer | null;
}
