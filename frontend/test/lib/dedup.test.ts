import { describe, expect, it } from "vitest";

import { LRUSet } from "~/lib/dedup";

describe("LRUSet", () => {
  it("adds and reports membership", () => {
    const s = new LRUSet(10);
    expect(s.add("a")).toBe(true);
    expect(s.has("a")).toBe(true);
  });

  it("returns false when adding a duplicate", () => {
    const s = new LRUSet(10);
    s.add("a");
    expect(s.add("a")).toBe(false);
  });

  it("evicts the oldest entry once capacity is exceeded", () => {
    const s = new LRUSet(3);
    s.add("a");
    s.add("b");
    s.add("c");
    s.add("d");
    expect(s.has("a")).toBe(false);
    expect(s.has("b")).toBe(true);
    expect(s.has("c")).toBe(true);
    expect(s.has("d")).toBe(true);
  });
});
