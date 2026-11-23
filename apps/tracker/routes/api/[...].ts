import { defineHandler } from "void";

import { handleHttp } from "../../server/runtime.ts";

// The unnamed catch-all ranks after every other route, so /api/graphql and Void's /api/auth keep their own handlers.
const handler = defineHandler((c) => handleHttp(c.req.raw));

export { handler as DELETE, handler as GET, handler as PATCH, handler as POST, handler as PUT };
