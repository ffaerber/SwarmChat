import { NavLink, Outlet } from "react-router";

import { ME } from "~/lib/mock-data";
import { shortAddress } from "~/lib/format";

const NAV = [
  { to: "/chats", label: "Chats", icon: "💬" },
  { to: "/directory", label: "Directory", icon: "🧭" },
  { to: "/settings", label: "Settings", icon: "⚙️" },
];

export default function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      <aside className="flex w-16 flex-col items-center justify-between border-r border-slate-800 bg-slate-900/40 py-4">
        <div className="flex flex-col items-center gap-1">
          <div className="mb-2 grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-base font-bold text-white">
            S
          </div>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              className={({ isActive }) =>
                `grid h-10 w-10 place-items-center rounded-xl text-lg transition ${
                  isActive
                    ? "bg-brand-500/15 text-brand-200"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`
              }
            >
              <span aria-hidden>{item.icon}</span>
            </NavLink>
          ))}
        </div>
        <div
          title={ME}
          className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-xs font-medium text-slate-300"
        >
          {shortAddress(ME, 2).slice(0, 2)}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
