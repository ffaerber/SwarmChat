import { Link } from 'react-router'
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
