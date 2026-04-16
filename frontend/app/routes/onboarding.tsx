import { useState } from "react";
import { Link } from "react-router";

import type { Route } from "./+types/onboarding";

export function meta(_: Route.MetaArgs) {
  return [{ title: "SwarmChat — Onboarding" }];
}

type Step = "wallet" | "bee" | "stamp" | "register" | "done";

const STEPS: { id: Step; title: string; desc: string }[] = [
  {
    id: "wallet",
    title: "Connect wallet",
    desc: "Use your Ethereum wallet on Gnosis Chain (chain ID 100).",
  },
  {
    id: "bee",
    title: "Detect Bee node",
    desc: "Health check your local Bee node at http://127.0.0.1:1633.",
  },
  {
    id: "stamp",
    title: "Postage batch",
    desc: "Purchase a small postage batch so your messages can be stored.",
  },
  {
    id: "register",
    title: "Register profile",
    desc: "Pick a display name and publish your profile to the registry contract on Gnosis Chain.",
  },
];

export default function Onboarding() {
  const [active, setActive] = useState<Step>("wallet");
  const [name, setName] = useState("");
  const activeIdx = STEPS.findIndex((s) => s.id === active);

  return (
    <main className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900/60 p-8 backdrop-blur">
        <header className="mb-6">
          <p className="text-xs uppercase tracking-widest text-brand-400">
            SwarmChat
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Welcome aboard</h1>
          <p className="mt-2 text-sm text-slate-400">
            A four-step setup gets you registered on Swarm + Gnosis Chain.
          </p>
        </header>

        <ol className="space-y-3">
          {STEPS.map((s, i) => {
            const state =
              i < activeIdx ? "done" : i === activeIdx ? "active" : "pending";
            return (
              <li
                key={s.id}
                className={`flex gap-4 rounded-2xl border p-4 transition ${
                  state === "active"
                    ? "border-brand-500/60 bg-brand-500/5"
                    : "border-slate-800 bg-slate-900/40"
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    state === "done"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : state === "active"
                      ? "bg-brand-500/20 text-brand-200"
                      : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {state === "done" ? "✓" : i + 1}
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">{s.title}</h3>
                  <p className="mt-1 text-sm text-slate-400">{s.desc}</p>
                  {state === "active" && s.id === "register" && (
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={64}
                      placeholder="Display name"
                      className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm placeholder:text-slate-500 focus:border-brand-500 focus:outline-none"
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              const prev = STEPS[Math.max(0, activeIdx - 1)];
              setActive(prev.id);
            }}
            disabled={activeIdx === 0}
            className="rounded-lg px-4 py-2 text-sm text-slate-400 transition hover:text-slate-200 disabled:opacity-40"
          >
            ← Back
          </button>

          {activeIdx < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setActive(STEPS[activeIdx + 1].id)}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-500"
            >
              Continue
            </button>
          ) : (
            <Link
              to="/chats"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-500"
            >
              Enter SwarmChat →
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
