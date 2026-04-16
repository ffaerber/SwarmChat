import { describe, expect, it } from "vitest";

import { formatClock, formatRelativeTime, shortAddress } from "~/lib/format";

describe("shortAddress", () => {
  it("truncates long addresses with an ellipsis", () => {
    expect(shortAddress("0xA11CE0000000000000000000000000000000A11C")).toBe(
      "0xA11C…A11C",
    );
  });

  it("honours the chars argument", () => {
    expect(
      shortAddress("0xA11CE0000000000000000000000000000000A11C", 6),
    ).toBe("0xA11CE0…00A11C");
  });

  it("returns the input unchanged when shorter than the slice window", () => {
    expect(shortAddress("0x1234" as `0x${string}`)).toBe("0x1234");
  });
});

describe("formatRelativeTime", () => {
  const NOW = Date.UTC(2026, 3, 16, 12, 0, 0);

  it("says 'now' for values under a minute", () => {
    expect(formatRelativeTime(NOW - 10_000, NOW)).toBe("now");
  });

  it("renders minutes, hours, days and weeks", () => {
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe("5m");
    expect(formatRelativeTime(NOW - 3 * 3_600_000, NOW)).toBe("3h");
    expect(formatRelativeTime(NOW - 2 * 86_400_000, NOW)).toBe("2d");
    expect(formatRelativeTime(NOW - 14 * 86_400_000, NOW)).toBe("2w");
  });

  it("falls back to a locale date when older than a month", () => {
    const result = formatRelativeTime(NOW - 90 * 86_400_000, NOW);
    expect(result).toMatch(/\d/);
    expect(result).not.toMatch(/^\dw$/);
  });
});

describe("formatClock", () => {
  it("returns an HH:MM style string", () => {
    const ts = new Date(2026, 3, 16, 14, 32).getTime();
    expect(formatClock(ts)).toMatch(/^\d{1,2}:\d{2}\s?(AM|PM)?$/i);
  });
});
