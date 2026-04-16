import { NavLink, Outlet, useParams } from "react-router";

import { MOCK_CONVERSATIONS } from "~/lib/mock-data";
import { formatRelativeTime, shortAddress } from "~/lib/format";

export default function ChatsLayout() {
  const params = useParams();
  const activeAddress = params.address;

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-80 shrink-0 flex-col border-r border-slate-800 bg-slate-900/30">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Chats
          </h2>
          <NavLink
            to="/directory"
            className="rounded-md bg-slate-800/80 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
          >
            + New
          </NavLink>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {MOCK_CONVERSATIONS.map((c) => {
            const active = c.peer.toLowerCase() === activeAddress?.toLowerCase();
            return (
              <li key={c.peer}>
                <NavLink
                  to={`/chats/${c.peer}`}
                  className={`flex items-start gap-3 px-4 py-3 transition ${
                    active
                      ? "bg-brand-500/10"
                      : "hover:bg-slate-800/40"
                  }`}
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-800 text-sm font-semibold text-slate-200">
                    {c.peerName.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {c.peerName}
                      </span>
                      {c.lastTs && (
                        <span className="shrink-0 text-xs text-slate-500">
                          {formatRelativeTime(c.lastTs)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-slate-400">
                        {c.lastMessage ?? shortAddress(c.peer)}
                      </p>
                      {c.unread > 0 && (
                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white">
                          {c.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {activeAddress ? (
          <Outlet />
        ) : (
          <div className="grid h-full place-items-center text-center text-slate-500">
            <div>
              <p className="text-lg">Pick a conversation</p>
              <p className="mt-1 text-sm">
                or start a new one from the directory.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
