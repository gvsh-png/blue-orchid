import { jobs } from "@blue-orchid/core";
import { defineScheduled } from "void";

import { runJob } from "../server/runtime.ts";

export const cron = "7 * * * *";

export default defineScheduled(() => runJob("import-catalog", jobs["import-catalog"]));
