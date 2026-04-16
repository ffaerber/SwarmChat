import type { Route } from "./+types/_app.settings";
import { ME } from "~/lib/mock-data";
import { shortAddress } from "~/lib/format";

export function meta(_: Route.MetaArgs) {
  return [{ title: "SwarmChat — Settings" }];
}

export default function Settings() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-slate-800 bg-slate-900/40 px-6 py-4">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-xs text-slate-400">
          Profile, Bee node, postage, blocklist.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <Section title="Profile">
            <Field label="Address" value={ME} mono />
            <Field label="Display name" value="alice" editable />
            <Field
              label="PSS public key"
              value={"0x02" + "a".repeat(64)}
              mono
            />
            <Field label="Swarm overlay" value={"0x" + "a".repeat(64)} mono />
          </Section>

          <Section title="Bee node">
            <Field label="Endpoint" value="http://127.0.0.1:1633" mono />
            <Field label="Status" value="● healthy" />
            <Field label="Postage batch" value="balance: 0.0123 BZZ · 28d left" />
          </Section>

          <Section title="Blocklist">
            <p className="text-sm text-slate-400">
              No blocked addresses. Block users from any chat menu.
            </p>
          </Section>

          <Section title="Danger zone" tone="danger">
            <button
              type="button"
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20"
            >
              Deactivate account on registry
            </button>
          </Section>

          <p className="text-center text-xs text-slate-600">
            Logged in as {shortAddress(ME)}
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border p-5 ${
        tone === "danger"
          ? "border-red-500/20 bg-red-500/5"
          : "border-slate-800 bg-slate-900/40"
      }`}
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  mono,
  editable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  editable?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
      <span className="w-40 shrink-0 text-xs uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {editable ? (
        <input
          defaultValue={value}
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
      ) : (
        <code
          className={`flex-1 truncate rounded-lg bg-slate-950 px-3 py-2 text-xs ${
            mono ? "font-mono" : "font-sans text-slate-300"
          }`}
          title={value}
        >
          {value}
        </code>
      )}
    </div>
  );
}
