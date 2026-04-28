import { Link, NavLink, useLocation } from 'react-router'
import { useConversations } from '../hooks/useConversations'
import EnsName from './EnsName'

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export default function Sidebar() {
  const conversations = useConversations()
  const location = useLocation()

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `flex-1 text-center text-sm py-2.5 border-b-2 transition-colors ${
      isActive
        ? 'border-[#ff7a00] text-[#f5ede4]'
        : 'border-transparent text-[#a39690] hover:text-[#f5ede4]'
    }`

  return (
    <aside className="w-80 bg-[#18130f] border-r border-[#2e261f] flex flex-col">
      <div className="flex">
        <NavLink to="/" end className={tabClass}>Chats</NavLink>
        <NavLink to="/directory" className={tabClass}>Directory</NavLink>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-4 text-sm text-[#a39690]">
            No conversations yet. Open the Directory and start one.
          </div>
        ) : (
          <ul>
            {conversations.map(c => {
              const active = location.pathname === `/chat/${c.peer}`
              return (
                <li key={c.peer}>
                  <Link
                    to={`/chat/${c.peer}`}
                    className={`flex items-center gap-3 px-3 py-3 border-b border-[#2e261f] ${
                      active ? 'bg-[#221b16]' : 'hover:bg-[#221b16]'
                    }`}
                  >
                    <span className="h-10 w-10 flex-shrink-0 rounded-full bg-[#38302a] flex items-center justify-center text-[#ff7a00] font-semibold">
                      {c.peer.slice(2, 3).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="font-medium text-[#f5ede4] truncate">
                          <EnsName address={c.peer} />
                        </div>
                        <div className="text-xs text-[#a39690] flex-shrink-0">
                          {formatRelative(c.lastMessage.ts)}
                        </div>
                      </div>
                      <div className="text-xs text-[#a39690] truncate">
                        {c.lastMessage.direction === 'out' ? 'You: ' : ''}
                        {c.lastMessage.text}
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
