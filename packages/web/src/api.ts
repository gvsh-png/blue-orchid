import type { Operation } from "@blue-orchid/graphql/operations";
import { Effect, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
  operation: Schema.String,
  messages: Schema.Array(Schema.String),
}) {}

const Envelope = Schema.Struct({
  data: Schema.optionalKey(Schema.Unknown),
  errors: Schema.optionalKey(Schema.Array(Schema.Struct({ message: Schema.String }))),
});

/** Sends one operation from @blue-orchid/graphql/operations and decodes the answer with its result schema. */
export const query = Effect.fn("Api.query")(function* <A>(
  operation: Operation<A>,
  variables: Readonly<Record<string, unknown>> = {},
) {
  const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
  const envelope = yield* HttpClientRequest.post("/api/graphql").pipe(
    HttpClientRequest.bodyJsonUnsafe({ query: operation.document, variables, operationName: operation.name }),
    client.execute,
    Effect.flatMap(HttpClientResponse.schemaBodyJson(Envelope)),
  );
  if (envelope.errors !== undefined && envelope.errors.length > 0) {
    return yield* new ApiError({ operation: operation.name, messages: envelope.errors.map((error) => error.message) });
  }
  return yield* Schema.decodeUnknownEffect(operation.result)(envelope.data);
});
