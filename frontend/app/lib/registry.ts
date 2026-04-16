import type { Address, Profile } from "./types";

export const REGISTRY_ADDRESS: Address =
  "0x0000000000000000000000000000000000000000";

export const REGISTRY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "displayName", type: "string" },
      { name: "pssPublicKey", type: "bytes" },
      { name: "swarmOverlay", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "deactivate",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "isRegistered",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "getProfile",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "displayName", type: "string" },
      { name: "pssPublicKey", type: "bytes" },
      { name: "swarmOverlay", type: "bytes32" },
      { name: "updatedAt", type: "uint64" },
      { name: "active", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "getUserCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getUsers",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [{ type: "address[]" }],
  },
] as const;

export interface RegistryClient {
  isRegistered(user: Address): Promise<boolean>;
  getProfile(user: Address): Promise<Profile | null>;
  getUserCount(): Promise<number>;
  getUsers(offset: number, limit: number): Promise<Address[]>;
  register(
    displayName: string,
    pssPublicKey: `0x${string}`,
    swarmOverlay: `0x${string}`,
  ): Promise<`0x${string}`>;
  deactivate(): Promise<`0x${string}`>;
}
