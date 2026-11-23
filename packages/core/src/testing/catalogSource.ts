import { Layer } from "effect";

import { CatalogSource } from "../ports/CatalogSource.ts";

export const fakeCatalogSource = (fetch: CatalogSource["Service"]["fetch"]) =>
  Layer.succeed(CatalogSource, CatalogSource.of({ name: "fake", fetch }));
