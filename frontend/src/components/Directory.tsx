import { Link } from 'react-router'
import { useReadContract } from 'wagmi'
import { CONTACT_REGISTRY_ABI, CONTACT_REGISTRY_ADDRESS } from '../config/contracts'
import EnsName from './EnsName'

export default function Directory() {
  const { data: count } = useReadContract({
    address: CONTACT_REGISTRY_ADDRESS,
    abi: CONTACT_REGISTRY_ABI,
    functionName: 'getUserCount',
  })

  const total = count ? Number(count as bigint) : 0

  const { data: users } = useReadContract({
    address: CONTACT_REGISTRY_ADDRESS,
    abi: CONTACT_REGISTRY_ABI,
    functionName: 'getUsers',
    args: [0n, BigInt(Math.min(total, 100))],
    query: { enabled: total > 0 },
  })

  const list = (users as `0x${string}`[] | undefined) ?? []

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <h2 className="text-sm font-semibold text-[#f5ede4] mb-3">
        Directory <span className="text-[#a39690] font-normal">({total})</span>
      </h2>
      {list.length === 0 ? (
        <div className="text-sm text-[#a39690]">No registered users yet.</div>
      ) : (
        <ul className="space-y-1">
          {list.map(addr => (
            <li key={addr}>
              <Link
                to={`/chat/${addr}`}
                className="flex items-center gap-3 px-3 py-2 rounded hover:bg-[#221b16]"
              >
                <span className="h-8 w-8 rounded-full bg-[#2e261f]" />
                <div>
                  <EnsName address={addr} className="text-[#f5ede4]" />
                  <div className="text-xs text-[#a39690] font-mono">{addr.slice(0, 6)}...{addr.slice(-4)}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
