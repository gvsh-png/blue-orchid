import { describe, expect, it } from "@effect/vitest";
import { DateTime } from "effect";

import { release } from "../testing/fixtures.ts";
import { diffReleases } from "./diff.ts";

describe("diffReleases", () => {
  it("reports a release it has not seen as scheduled", () => {
    const changes = diffReleases([], [release()]);
    expect(changes.map((change) => change._tag)).toEqual(["EpisodeScheduled"]);
  });

  it("reports a moved release with its previous time", () => {
    const before = release();
    const after = release({ airsAt: DateTime.makeUnsafe("2026-01-16T15:00:00Z") });
    const [change] = diffReleases([before], [after]);
    expect(change?._tag).toBe("EpisodeRescheduled");
    expect(change?._tag === "EpisodeRescheduled" && DateTime.formatIso(change.previousAirsAt)).toBe(
      "2026-01-09T15:00:00.000Z",
    );
  });

  it("reports nothing when the time is the same", () => {
    expect(diffReleases([release()], [release()])).toEqual([]);
  });

  it("treats sub and dub of the same episode as separate releases", () => {
    const changes = diffReleases([release({ kind: "sub" })], [release({ kind: "sub" }), release({ kind: "dub" })]);
    expect(changes).toHaveLength(1);
  });
});
