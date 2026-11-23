import { defineHandler } from "void";
import { getUser } from "void/auth";

import { handleGraphQL } from "../../server/runtime.ts";

const handler = defineHandler((c) => {
  const user = getUser();
  return handleGraphQL(c.req.raw, user === null ? null : { id: user.id, name: user.name });
});

export { handler as GET, handler as POST };
