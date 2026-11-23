import { jobs } from "@blue-orchid/core";
import { defineScheduled } from "void";

import { runJob } from "../server/runtime.ts";

export const cron = "*/5 * * * *";

export default defineScheduled(() => runJob("deliver-notifications", jobs["deliver-notifications"]));
