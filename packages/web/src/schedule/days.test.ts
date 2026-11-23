import { describe, expect, it } from "@effect/vitest";
import { DateTime } from "effect";

import { formatTime, groupByDay } from "./days.ts";

const at = (iso: string) => ({ airsAt: DateTime.makeUnsafe(iso) });

describe("groupByDay", () => {
  it("puts a late UTC release on the next day in Oslo", () => {
    const days = groupByDay(
      [at("2026-01-09T12:00:00Z"), at("2026-01-09T23:30:00Z")],
      (row) => row.airsAt,
      "Europe/Oslo",
    );
    expect(days.map((day) => [day.label, day.rows.length])).toEqual([
      ["Friday 9 January", 1],
      ["Saturday 10 January", 1],
    ]);
  });

  it("formats times on a 24-hour clock in the given zone", () => {
    expect(formatTime(DateTime.makeUnsafe("2026-01-09T23:30:00Z"), "Europe/Oslo")).toBe("00:30");
  });
});
