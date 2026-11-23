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

export class MessageNotSent extends Schema.TaggedError<MessageNotSent>()("MessageNotSent", {
  platform: Schema.String,
  cause: Schema.Defect(),
}) {}
