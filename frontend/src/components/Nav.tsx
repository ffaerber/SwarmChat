import { Link } from 'react-router'
import { useAccount } from 'wagmi'
import EnsName from './EnsName'

export default function Nav({ onConnectClick }: { onConnectClick: () => void }) {
  const { address, isConnected } = useAccount()

  return (
    <nav className="h-[52px] bg-[#161c22] border-b border-[#252d34] flex items-center px-4 sticky top-0 z-40">
      <Link to="/" className="flex items-center gap-2 mr-6">
        <span className="inline-block h-6 w-6 rounded-full bg-[#25d366]" />
        <span className="font-semibold text-[#25d366] text-base">swarmchat</span>
      </Link>

      <div className="flex-1" />

      {isConnected && address ? (
        <button
          onClick={onConnectClick}
          className="text-sm px-3 py-1.5 bg-[#1c2329] border border-[#252d34] text-[#e8eef2] rounded cursor-pointer hover:bg-[#252d34]"
        >
          <EnsName address={address} />
        </button>
      ) : (
        <button
          onClick={onConnectClick}
          className="text-sm px-3 py-1.5 bg-[#25d366] text-black font-semibold rounded cursor-pointer hover:brightness-110"
        >
          Connect
        </button>
      )}
    </nav>
  )
}
