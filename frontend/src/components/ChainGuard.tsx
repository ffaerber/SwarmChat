import { useAccount, useSwitchChain } from 'wagmi'
import { gnosis } from 'wagmi/chains'

export default function ChainGuard() {
  const { isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  if (!isConnected || chainId === gnosis.id) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <div className="bg-[#18130f] border border-[#2e261f] rounded-lg p-8 max-w-md text-center">
        <h2 className="text-lg font-semibold text-[#f5ede4] mb-3">Wrong Network</h2>
        <p className="text-sm text-[#a39690] mb-6">
          SwarmChat runs on Gnosis Chain.
        </p>
        <button
          onClick={() => switchChain({ chainId: gnosis.id })}
          className="px-6 py-2 bg-[#ff7a00] text-black text-sm font-semibold rounded hover:brightness-110 cursor-pointer"
        >
          Switch to Gnosis Chain
        </button>
      </div>
    </div>
  )
}
