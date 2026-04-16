import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

import type { Route } from "./+types/_app.chats.$address";
import { ME, MOCK_PROFILES, mockMessagesFor } from "~/lib/mock-data";
import type { Address, ChatMessage } from "~/lib/types";
import { formatClock, shortAddress } from "~/lib/format";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `SwarmChat — ${shortAddress(params.address ?? "")}` }];
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const address = (params.address as Address) ?? null;
  const peer =
    MOCK_PROFILES.find(
      (p) => p.address.toLowerCase() === address?.toLowerCase(),
    ) ?? null;
  return {
    address,
    peer,
    messages: address ? mockMessagesFor(address) : [],
  };
}

export default function Conversation({ loaderData }: Route.ComponentProps) {
  const { address, peer, messages: initialMessages } = loaderData;
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const peerLabel = useMemo(() => {
    if (peer?.displayName) return peer.displayName;
    return address ? shortAddress(address) : "Unknown";
  }, [peer, address]);

  function send() {
    if (!draft.trim() || !address) return;
    const now = Date.now();
    const msgId = ("0x" +
      Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16),
      ).join("")) as `0x${string}`;
    const next: ChatMessage = {
      msgId,
      from: ME,
      to: address,
      ts: now,
      text: draft.trim(),
      status: "pending",
      outbound: true,
    };
    setMessages((prev) => [...prev, next]);
    setDraft("");
  }

  if (!address) {
    return <EmptyState />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/40 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-800 text-sm font-semibold">
            {peerLabel.slice(0, 1)}
          </div>
          <div>
            <h2 className="text-sm font-semibold">{peerLabel}</h2>
            <p className="text-xs text-slate-400">
              {peer?.ensName ?? shortAddress(address)} ·{" "}
              {peer?.active ? "online" : "offline"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/call/${address}`}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700"
            title="Voice call"
          >
            📞
          </Link>
          <Link
            to={`/call/${address}?video=1`}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500"
            title="Video call"
          >
            🎥
          </Link>
          <button
            type="button"
            className="rounded-lg px-2 py-1.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            title="Menu"
          >
            ⋮
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        <ol className="mx-auto flex max-w-2xl flex-col gap-2">
          {messages.map((m) => (
            <Bubble key={m.msgId} message={m} />
          ))}
        </ol>
      </div>

      <footer className="border-t border-slate-800 bg-slate-900/40 px-6 py-3">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <button
            type="button"
            className="rounded-lg px-2 py-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            title="Attach"
          >
            📎
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Type a message..."
            className="max-h-40 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm placeholder:text-slate-500 focus:border-brand-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim()}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  return (
    <li
      className={`flex ${message.outbound ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
          message.outbound
            ? "rounded-br-sm bg-brand-600 text-white"
            : "rounded-bl-sm bg-slate-800 text-slate-100"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        <div
          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
            message.outbound ? "text-brand-100/80" : "text-slate-400"
          }`}
        >
          <span>{formatClock(message.ts)}</span>
          {message.outbound && <StatusTick status={message.status} />}
        </div>
      </div>
    </li>
  );
}

function StatusTick({ status }: { status: ChatMessage["status"] }) {
  if (status === "pending") return <span title="pending">…</span>;
  if (status === "sent") return <span title="sent">✓</span>;
  if (status === "delivered") return <span title="delivered">✓✓</span>;
  if (status === "read")
    return (
      <span className="text-sky-300" title="read">
        ✓✓
      </span>
    );
  if (status === "failed")
    return (
      <span className="text-red-300" title="failed">
        !
      </span>
    );
  return null;
}

function EmptyState() {
  return (
    <div className="grid h-full place-items-center text-center text-slate-500">
      <div>
        <p className="text-lg">Pick a conversation</p>
        <p className="mt-1 text-sm">or start a new one from the directory.</p>
      </div>
    </div>
  );
}
