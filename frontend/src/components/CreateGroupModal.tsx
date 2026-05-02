import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import { CONTACT_REGISTRY_ABI, CONTACT_REGISTRY_ADDRESS } from '../config/contracts'
import { useMessenger } from '../contexts/MessengerContext'
import EnsName from './EnsName'
import type { Hex } from '../lib/types'

interface Props {
  onClose: () => void
}

export default function CreateGroupModal({ onClose }: Props) {
  const { address } = useAccount()
  const { handles, ready } = useMessenger()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

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
  const all = (users as Hex[] | undefined) ?? []
  const selectable = all.filter(a => a.toLowerCase() !== (address ?? '').toLowerCase())

  const toggle = (addr: Hex) => {
    const next = new Set(picked)
    const k = addr.toLowerCase()
    if (next.has(k)) next.delete(k)
    else next.add(k)
    setPicked(next)
  }

  const submit = async () => {
    if (!ready || !handles) {
      toast.error('messenger not ready')
      return
    }
    if (picked.size === 0) {
      toast.error('pick at least one other member')
      return
    }
    const members = selectable.filter(a => picked.has(a.toLowerCase()))
    setSubmitting(true)
    try {
      const group = await handles.createGroup(name, members)
      toast.success(`group "${group.name}" created`)
      onClose()
      navigate(`/group/${group.id}`)
    } catch (err) {
      toast.error(`create failed: ${String(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#18130f] border border-[#2e261f] rounded-lg w-full max-w-md flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-[#2e261f] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#f5ede4]">New group</h2>
          <button
            onClick={onClose}
            className="text-[#a39690] hover:text-[#f5ede4] cursor-pointer text-lg leading-none"
            aria-label="close"
          >×</button>
        </header>

        <div className="p-4 space-y-3 overflow-y-auto">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Group name"
            className="w-full bg-[#0d0a08] border border-[#2e261f] rounded px-3 py-2 text-sm text-[#f5ede4] placeholder:text-[#a39690] focus:outline-none focus:border-[#ff7a00]"
          />

          <div>
            <div className="text-xs text-[#a39690] mb-2">
              Members ({picked.size} selected)
            </div>
            {selectable.length === 0 ? (
              <div className="text-xs text-[#a39690]">No other registered users.</div>
            ) : (
              <ul className="space-y-1 max-h-72 overflow-y-auto">
                {selectable.map(addr => {
                  const checked = picked.has(addr.toLowerCase())
                  return (
                    <li key={addr}>
                      <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#221b16] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(addr)}
                          className="accent-[#ff7a00]"
                        />
                        <div className="flex-1 min-w-0">
                          <EnsName address={addr} className="text-[#f5ede4] text-sm" />
                          <div className="text-xs text-[#a39690] font-mono truncate">
                            {addr.slice(0, 6)}…{addr.slice(-4)}
                          </div>
                        </div>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <footer className="px-4 py-3 border-t border-[#2e261f] flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-[#a39690] hover:text-[#f5ede4] cursor-pointer"
          >Cancel</button>
          <button
            onClick={submit}
            disabled={submitting || picked.size === 0 || !ready}
            className="px-4 py-1.5 bg-[#ff7a00] text-black text-sm font-semibold rounded hover:brightness-110 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >Create</button>
        </footer>
      </div>
    </div>
  )
}
