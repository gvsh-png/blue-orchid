import { Schema } from "effect";

export const ShowId = Schema.NonEmptyString.pipe(Schema.brand("ShowId"));
export type ShowId = typeof ShowId.Type;

export const UpdateId = Schema.NonEmptyString.pipe(Schema.brand("UpdateId"));
export type UpdateId = typeof UpdateId.Type;
