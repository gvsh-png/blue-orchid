import { jobs } from "@blue-orchid/core";
import { defineScheduled } from "void";

import { runJob } from "../server/runtime.ts";

export const cron = "*/30 * * * *";

export default defineScheduled(() => runJob("sync-schedule", jobs["sync-schedule"]));
