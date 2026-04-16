import { describe, expect, it } from "vitest";

import { REGISTRY_ABI } from "~/lib/registry";

describe("REGISTRY_ABI", () => {
  it("exposes the functions defined in ContactRegistry.sol", () => {
    const names = REGISTRY_ABI.map((entry) => entry.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "register",
        "deactivate",
        "isRegistered",
        "getProfile",
        "getUserCount",
        "getUsers",
      ]),
    );
  });

  it("declares register inputs in the spec order", () => {
    const register = REGISTRY_ABI.find((e) => e.name === "register");
    expect(register?.inputs.map((i) => i.name)).toEqual([
      "displayName",
      "pssPublicKey",
      "swarmOverlay",
    ]);
    expect(register?.inputs.map((i) => i.type)).toEqual([
      "string",
      "bytes",
      "bytes32",
    ]);
  });

  it("returns the full Profile tuple from getProfile", () => {
    const getProfile = REGISTRY_ABI.find((e) => e.name === "getProfile");
    expect(getProfile?.outputs.map((o) => o.name)).toEqual([
      "displayName",
      "pssPublicKey",
      "swarmOverlay",
      "updatedAt",
      "active",
    ]);
  });
});
