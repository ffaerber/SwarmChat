import { useMemo, useState } from "react";
import { Link } from "react-router";

import type { Route } from "./+types/_app.directory";
import { MOCK_PROFILES } from "~/lib/mock-data";
import { formatRelativeTime, shortAddress } from "~/lib/format";

export function meta(_: Route.MetaArgs) {
  return [{ title: "SwarmChat — Directory" }];
}

export async function clientLoader(_: Route.ClientLoaderArgs) {
  return { profiles: MOCK_PROFILES };
}

export default function Directory({ loaderData }: Route.ComponentProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return loaderData.profiles;
    return loaderData.profiles.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.ensName?.toLowerCase().includes(q),
    );
  }, [loaderData.profiles, query]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-3 border-b border-slate-800 bg-slate-900/40 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Directory</h1>
          <p className="text-xs text-slate-400">
            All addresses registered in the on-chain ContactRegistry.
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search address, name or ENS..."
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm placeholder:text-slate-500 focus:border-brand-500 focus:outline-none sm:w-80"
        />
      </header>

      <ul className="flex-1 overflow-y-auto divide-y divide-slate-800">
        {filtered.map((p) => (
          <li
            key={p.address}
            className="flex items-center justify-between gap-4 px-6 py-3 hover:bg-slate-900/40"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-800 text-sm font-semibold">
                {p.displayName.slice(0, 1)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.displayName}</span>
                  {!p.active && (
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                      inactive
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {p.ensName ? `${p.ensName} · ` : ""}
                  {shortAddress(p.address)} · updated{" "}
                  {formatRelativeTime(p.updatedAt)}
                </p>
              </div>
            </div>
            <Link
              to={`/chats/${p.address}`}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500"
            >
              Start chat
            </Link>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-6 py-12 text-center text-sm text-slate-500">
            No matches.
          </li>
        )}
      </ul>
    </div>
  );
}
