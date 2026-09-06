import { describe, expect, it } from "vitest";
import { durationInputToSeconds, durationSecondsToInput } from "@/lib/auctionDurationInput";

describe("auction duration input", () => {
  it("decomposes an hour-aligned duration into days and hours", () => {
    expect(durationSecondsToInput("7200")).toEqual({
      days: "0",
      hours: "2",
      durationSeconds: "7200",
      roundedUp: false
    });
  });

  it("converts days and hours to the exact canonical duration in seconds", () => {
    expect(durationInputToSeconds("2", "3")).toBe("183600");
    expect(durationInputToSeconds("0", "0")).toBe("0");
  });

  it.each(["-1", "1.5", "not-a-number", ""])("rejects invalid day input %j", (days) => {
    expect(durationInputToSeconds(days, "2")).toBeNull();
  });

  it("rejects hours outside the selectable whole-hour range", () => {
    expect(durationInputToSeconds("1", "-1")).toBeNull();
    expect(durationInputToSeconds("1", "1.5")).toBeNull();
    expect(durationInputToSeconds("1", "24")).toBeNull();
  });

  it("rounds a non-aligned external duration up to the next hour", () => {
    expect(durationSecondsToInput("7201")).toEqual({
      days: "0",
      hours: "3",
      durationSeconds: "10800",
      roundedUp: true
    });
  });
});
