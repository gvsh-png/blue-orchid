import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect } from "effect";

import { weekWindow } from "./loadWeek.ts";

describe("weekWindow", () => {
  it.effect("ends at local midnight when the clocks change during the week", () =>
    Effect.gen(function* () {
      const { from, to } = yield* weekWindow(DateTime.makeUnsafe("2027-03-25T12:00:00Z"), "Europe/Oslo");
      expect(DateTime.formatIso(from)).toBe("2027-03-24T23:00:00.000Z");
      expect(DateTime.formatIso(to)).toBe("2027-03-31T22:00:00.000Z");
    }),
  );
});
