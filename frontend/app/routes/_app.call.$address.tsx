import { useState } from "react";
import { Link, useSearchParams } from "react-router";

import type { Route } from "./+types/_app.call.$address";
import { MOCK_PROFILES } from "~/lib/mock-data";
import { shortAddress } from "~/lib/format";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `SwarmChat — Call ${shortAddress(params.address ?? "")}` }];
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const peer = MOCK_PROFILES.find(
    (p) => p.address.toLowerCase() === params.address?.toLowerCase(),
  );
  return { address: params.address, peer };
}

export default function Call({ loaderData }: Route.ComponentProps) {
  const { address, peer } = loaderData;
  const [params] = useSearchParams();
  const isVideo = params.get("video") === "1";

  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(!isVideo);
  const [state] = useState<"connecting" | "connected">("connecting");

  const peerLabel = peer?.displayName ?? shortAddress(address ?? "");

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/40 px-6 py-3">
        <div>
          <h2 className="text-sm font-semibold">{peerLabel}</h2>
          <p className="text-xs text-slate-400">
            {isVideo ? "Video call" : "Voice call"} · {state}
          </p>
        </div>
        <Link
          to={`/chats/${address}`}
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          ← Back to chat
        </Link>
      </header>

      <div className="relative flex-1 overflow-hidden bg-slate-900">
        <div className="absolute inset-0 grid place-items-center">
          {isVideo ? (
            <div className="text-center">
              <div className="mx-auto grid h-32 w-32 place-items-center rounded-full bg-slate-800 text-4xl">
                {peerLabel.slice(0, 1)}
              </div>
              <p className="mt-4 text-lg">{peerLabel}</p>
              <p className="text-sm text-slate-500">Connecting over PSS...</p>
            </div>
          ) : (
            <div className="text-center">
              <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-slate-800 text-3xl">
                📞
              </div>
              <p className="mt-4 text-lg">{peerLabel}</p>
              <p className="text-sm text-slate-500">Audio call · {state}</p>
            </div>
          )}
        </div>

        {isVideo && (
          <div className="absolute bottom-6 right-6 grid h-32 w-44 place-items-center rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-400">
            you
          </div>
        )}
      </div>

      <footer className="flex items-center justify-center gap-3 border-t border-slate-800 bg-slate-900/40 px-6 py-4">
        <CtrlBtn
          active={!muted}
          onClick={() => setMuted((m) => !m)}
          label={muted ? "🔇" : "🎙️"}
          title={muted ? "Unmute" : "Mute"}
        />
        {isVideo && (
          <CtrlBtn
            active={!cameraOff}
            onClick={() => setCameraOff((c) => !c)}
            label={cameraOff ? "📷" : "🎥"}
            title={cameraOff ? "Turn camera on" : "Turn camera off"}
          />
        )}
        <Link
          to={`/chats/${address}`}
          title="Hang up"
          className="grid h-12 w-12 place-items-center rounded-full bg-red-600 text-xl text-white hover:bg-red-500"
        >
          ✖
        </Link>
      </footer>
    </div>
  );
}

function CtrlBtn({
  active,
  onClick,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`grid h-12 w-12 place-items-center rounded-full text-xl transition ${
        active
          ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
          : "bg-red-500/20 text-red-300 hover:bg-red-500/30"
      }`}
    >
      {label}
    </button>
  );
}
