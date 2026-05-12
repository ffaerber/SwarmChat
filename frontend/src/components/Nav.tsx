import { Link, NavLink } from 'react-router'
import { useAccount } from 'wagmi'
import EnsName from './EnsName'

export default function Nav({ onConnectClick }: { onConnectClick: () => void }) {
  const { address, isConnected } = useAccount()

  return (
    <nav className="h-[52px] bg-[#18130f] border-b border-[#2e261f] flex items-center px-4 sticky top-0 z-40">
      <Link to="/" className="flex items-center gap-2 mr-6">
        <span className="inline-block h-6 w-6 rounded-full bg-[#ff7a00]" />
        <span className="font-semibold text-[#ff7a00] text-base">swarmchat</span>
      </Link>

      <div className="flex-1" />

      {isConnected && (
        <NavLink
          to="/settings"
          aria-label="settings"
          title="Settings"
          className={({ isActive }) =>
            `h-9 w-9 mr-2 flex items-center justify-center rounded-full cursor-pointer ${
              isActive
                ? 'text-[#ff7a00] bg-[#221b16]'
                : 'text-[#a39690] hover:text-[#ff7a00] hover:bg-[#221b16]'
            }`
          }
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </NavLink>
      )}

      {isConnected && address ? (
        <button
          onClick={onConnectClick}
          className="text-sm px-3 py-1.5 bg-[#221b16] border border-[#2e261f] text-[#f5ede4] rounded cursor-pointer hover:bg-[#2e261f]"
        >
          <EnsName address={address} />
        </button>
      ) : (
        <button
          onClick={onConnectClick}
          className="text-sm px-3 py-1.5 bg-[#ff7a00] text-black font-semibold rounded cursor-pointer hover:brightness-110"
        >
          Connect
        </button>
      )}
    </nav>
  )
}
