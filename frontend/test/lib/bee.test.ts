import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BeeClient } from "~/lib/bee";

const realFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("BeeClient", () => {
  it("hits /health on the configured url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new BeeClient("http://example.test:1633");
    const result = await client.health();

    expect(fetchMock).toHaveBeenCalledWith("http://example.test:1633/health");
    expect(result).toEqual({ status: "ok" });
  });

  it("throws when /addresses returns a non-2xx response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("nope", { status: 500 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new BeeClient();
    await expect(client.addresses()).rejects.toThrow(/addresses failed: 500/);
  });

  it("defaults to the local Bee endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await new BeeClient().health();
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:1633/health");
  });
});
