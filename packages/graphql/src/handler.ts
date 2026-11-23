import { GraphQLError } from "graphql";
import type { Plugin } from "graphql-yoga";
import { createYoga } from "graphql-yoga";

import type { GraphQLContext } from "./context.ts";
import { operations } from "./operations.ts";
import { schema } from "./schema.ts";

export interface GraphQLHandler {
  readonly fetch: (request: Request, context: GraphQLContext) => Response | Promise<Response>;
}

export const graphqlPath = "/api/graphql";

const allowed: ReadonlySet<string> = new Set(operations.map((operation) => operation.document));

/** The API is private: it runs only the documents in operations.ts, exactly as the website sends them. */
const onlyKnownOperations: Plugin = {
  onParams: ({ params, setResult }) => {
    if (params.query === undefined || !allowed.has(params.query)) {
      setResult({
        errors: [
          new GraphQLError("This API only runs the website's own operations.", {
            extensions: { code: "OPERATION_NOT_ALLOWED" },
          }),
        ],
      });
    }
  },
};

/**
 * Errors that are not GraphQLErrors reach clients masked as "Unexpected error". `explore` turns on GraphiQL and
 * accepts any operation; only local development sets it.
 */
export const makeGraphQLHandler = (options: { readonly explore: boolean }): GraphQLHandler => {
  const yoga = createYoga<GraphQLContext>({
    schema,
    graphqlEndpoint: graphqlPath,
    graphiql: options.explore,
    landingPage: false,
    plugins: options.explore ? [] : [onlyKnownOperations],
  });
  return { fetch: (request, context) => yoga.fetch(request, context) };
};
