import { Schema } from "effect";

import { ShowId } from "./ids.ts";

export class Show extends Schema.Class<Show>("Show")({
  id: ShowId,
  title: Schema.NonEmptyString,
  imageUrl: Schema.NullOr(Schema.String),
  episodes: Schema.NullOr(Schema.Int),
}) {}
