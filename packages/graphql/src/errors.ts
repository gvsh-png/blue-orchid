import { GraphQLError } from "graphql";

/** Clients branch on `extensions.code`, never on the message. */
export const badInput = (message: string) => new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });

/** Store failures reach the client as one opaque error. The cause goes to the log. */
export const internal = () => new GraphQLError("Something went wrong.", { extensions: { code: "INTERNAL" } });
