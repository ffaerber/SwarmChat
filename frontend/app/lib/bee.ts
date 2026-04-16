const DEFAULT_BEE_URL = "http://127.0.0.1:1633";

export interface BeeAddresses {
  overlay: `0x${string}`;
  underlay: string[];
  ethereum: `0x${string}`;
  publicKey: `0x${string}`;
  pssPublicKey: `0x${string}`;
}

export class BeeClient {
  constructor(public url: string = DEFAULT_BEE_URL) {}

  async health(): Promise<{ status: string }> {
    const res = await fetch(`${this.url}/health`);
    if (!res.ok) throw new Error(`bee unhealthy: ${res.status}`);
    return res.json();
  }

  async addresses(): Promise<BeeAddresses> {
    const res = await fetch(`${this.url}/addresses`);
    if (!res.ok) throw new Error(`bee /addresses failed: ${res.status}`);
    return res.json();
  }
}
