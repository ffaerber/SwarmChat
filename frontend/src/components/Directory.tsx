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
      <h2 className="text-sm font-semibold text-[#e8eef2] mb-3">
        Directory <span className="text-[#8a97a3] font-normal">({total})</span>
      </h2>
      {list.length === 0 ? (
        <div className="text-sm text-[#8a97a3]">No registered users yet.</div>
      ) : (
        <ul className="space-y-1">
          {list.map(addr => (
            <li key={addr}>
              <Link
                to={`/chat/${addr}`}
                className="flex items-center gap-3 px-3 py-2 rounded hover:bg-[#1c2329]"
              >
                <span className="h-8 w-8 rounded-full bg-[#252d34]" />
                <div>
                  <EnsName address={addr} className="text-[#e8eef2]" />
                  <div className="text-xs text-[#8a97a3] font-mono">{addr.slice(0, 6)}...{addr.slice(-4)}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
