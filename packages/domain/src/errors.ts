import { Schema } from "effect";

export class ShowNotFound extends Schema.TaggedError<ShowNotFound>()("ShowNotFound", {
  query: Schema.String,
}) {}

export class StoreFailed extends Schema.TaggedError<StoreFailed>()("StoreFailed", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

export class SourceUnavailable extends Schema.TaggedError<SourceUnavailable>()("SourceUnavailable", {
  source: Schema.String,
  cause: Schema.Defect(),
}) {}

/** `permanent` means retrying cannot help, such as a user who blocks DMs from the bot. */
export class MessageNotSent extends Schema.TaggedError<MessageNotSent>()("MessageNotSent", {
  platform: Schema.String,
  permanent: Schema.Boolean,
  cause: Schema.Defect(),
}) {}
