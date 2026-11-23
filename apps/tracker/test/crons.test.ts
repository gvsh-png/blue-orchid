import { readdirSync, readFileSync } from "node:fs";

import { jobs } from "@blue-orchid/core";
import { describe, expect, it } from "@effect/vitest";

const dir = new URL("../crons/", import.meta.url);
const files = readdirSync(dir).filter((file) => file.endsWith(".ts") && !file.startsWith("_"));

describe("crons/", () => {
  it("has one file per job in packages/core/src/jobs.ts, and no others", () => {
    expect(files.map((file) => file.replace(/\.ts$/, "")).toSorted()).toEqual(Object.keys(jobs).toSorted());
  });

  for (const file of files) {
    const name = file.replace(/\.ts$/, "");
    it(`${file} schedules and runs jobs["${name}"]`, () => {
      const source = readFileSync(new URL(file, dir), "utf8");
      expect(source).toMatch(/export const cron = "[^"]+";/);
      expect(source).toContain(`runJob("${name}", jobs["${name}"])`);
    });
  }
});
