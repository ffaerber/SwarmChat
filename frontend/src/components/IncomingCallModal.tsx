import { useReadContract } from 'wagmi'
import { useMessenger } from '../contexts/MessengerContext'
import { useCall } from '../hooks/useCall'
import { CONTACT_REGISTRY_ABI, CONTACT_REGISTRY_ADDRESS } from '../config/contracts'
import EnsName from './EnsName'

export default function IncomingCallModal() {
  const { handles } = useMessenger()
  const call = useCall()

  const peer = call?.peer.wallet
  const { data: profile } = useReadContract({
    address: CONTACT_REGISTRY_ADDRESS,
    abi: CONTACT_REGISTRY_ABI,
    functionName: 'getProfile',
    args: peer ? [peer] : undefined,
    query: { enabled: !!peer },
  })
  const displayName = Array.isArray(profile) ? (profile[0] as string) : ''

  if (!call || !handles) return null
  if (call.direction !== 'incoming' || call.state !== 'ringing') return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-[#18130f] border border-[#2e261f] rounded-lg p-6 max-w-sm w-full mx-4 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-[#38302a] flex items-center justify-center text-[#ff7a00] font-bold text-2xl mb-3">
          {displayName ? displayName.slice(0, 1).toUpperCase() : call.peer.wallet.slice(2, 3).toUpperCase()}
        </div>
        <div className="text-base font-semibold text-[#f5ede4]">
          {displayName || <EnsName address={call.peer.wallet} />}
        </div>
        <div className="text-xs text-[#a39690] mb-5">
          incoming {call.callType} call
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => handles.calls.rejectCall().catch(console.error)}
            className="px-4 py-2 rounded-full bg-[#221b16] border border-[#2e261f] text-[#f5ede4] text-sm cursor-pointer hover:bg-[#2e261f]"
          >
            Decline
          </button>
          <button
            onClick={() => handles.calls.acceptCall().catch(console.error)}
            className="px-4 py-2 rounded-full bg-[#ff7a00] text-black text-sm font-semibold cursor-pointer hover:brightness-110"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
