import { createYoga } from "graphql-yoga";

import type { GraphQLContext } from "./context.ts";
import { schema } from "./schema.ts";

export interface GraphQLHandler {
  readonly fetch: (request: Request, context: GraphQLContext) => Response | Promise<Response>;
}

export const graphqlPath = "/api/graphql";

/** The private API. Errors that are not GraphQLErrors reach clients masked as "Unexpected error". */
export const makeGraphQLHandler = (options: { readonly graphiql: boolean }): GraphQLHandler => {
  const yoga = createYoga<GraphQLContext>({
    schema,
    graphqlEndpoint: graphqlPath,
    graphiql: options.graphiql,
    landingPage: false,
  });
  return { fetch: (request, context) => yoga.fetch(request, context) };
};
