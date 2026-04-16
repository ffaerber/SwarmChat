import { useParams } from 'react-router'
import { useReadContract } from 'wagmi'
import { CONTACT_REGISTRY_ABI, CONTACT_REGISTRY_ADDRESS } from '../config/contracts'
import EnsName from './EnsName'

export default function Conversation() {
  const { peer } = useParams<{ peer: string }>()

  const { data: profile } = useReadContract({
    address: CONTACT_REGISTRY_ADDRESS,
    abi: CONTACT_REGISTRY_ABI,
    functionName: 'getProfile',
    args: peer ? [peer as `0x${string}`] : undefined,
    query: { enabled: !!peer },
  })

  const displayName = Array.isArray(profile) ? (profile[0] as string) : ''

  if (!peer) return null

  return (
    <div className="flex-1 flex flex-col">
      <header className="h-[52px] border-b border-[#252d34] flex items-center px-4">
        <div className="font-semibold text-[#e8eef2]">{displayName || <EnsName address={peer} />}</div>
        <div className="ml-3 text-xs text-[#8a97a3] font-mono">{peer.slice(0, 6)}...{peer.slice(-4)}</div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* Messages hydrated from IndexedDB + live PSS subscription */}
        <div className="text-center text-xs text-[#8a97a3]">No messages yet.</div>
      </div>

      <footer className="border-t border-[#252d34] p-3 flex gap-2">
        <input
          type="text"
          placeholder="Type a message..."
          className="flex-1 bg-[#0f1419] border border-[#252d34] rounded px-3 py-2 text-sm text-[#e8eef2]"
        />
        <button className="px-4 bg-[#25d366] text-black text-sm font-semibold rounded hover:brightness-110">
          Send
        </button>
      </footer>
    </div>
  )
}
