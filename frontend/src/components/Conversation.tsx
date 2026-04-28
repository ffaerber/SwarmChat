import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useReadContract } from 'wagmi'
import { CONTACT_REGISTRY_ABI, CONTACT_REGISTRY_ADDRESS } from '../config/contracts'
import { useConversation } from '../hooks/useConversation'
import { useMessenger } from '../contexts/MessengerContext'
import EnsName from './EnsName'
import type { Hex } from '../lib/types'

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function StatusTick({ status }: { status?: string }) {
  if (!status) return null
  if (status === 'failed') return <span className="text-red-400">!</span>
  if (status === 'read') return <span>✓✓</span>
  if (status === 'delivered') return <span>✓✓</span>
  return <span>✓</span>
}

export default function Conversation() {
  const { peer: peerParam } = useParams<{ peer: string }>()
  const peer = peerParam as Hex | undefined
  const { ready } = useMessenger()
  const { messages, send } = useConversation(peer)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: profile } = useReadContract({
    address: CONTACT_REGISTRY_ADDRESS,
    abi: CONTACT_REGISTRY_ABI,
    functionName: 'getProfile',
    args: peer ? [peer] : undefined,
    query: { enabled: !!peer },
  })
  const displayName = Array.isArray(profile) ? (profile[0] as string) : ''

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length])

  if (!peer) return null

  const handleSend = async () => {
    if (!draft.trim() || sending) return
    setSending(true)
    try {
      await send(draft)
      setDraft('')
    } catch (err) {
      console.error('send failed', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="h-[56px] bg-[#18130f] border-b border-[#2e261f] flex items-center px-4 gap-3">
        <span className="h-9 w-9 rounded-full bg-[#38302a] flex items-center justify-center text-[#ff7a00] font-semibold">
          {displayName ? displayName.slice(0, 1).toUpperCase() : peer.slice(2, 3).toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[#f5ede4] truncate">
            {displayName || <EnsName address={peer} />}
          </div>
          <div className="text-xs text-[#a39690] font-mono truncate">
            {peer.slice(0, 6)}...{peer.slice(-4)}
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#0d0a08]">
        {messages.length === 0 ? (
          <div className="text-center text-xs text-[#a39690] mt-8">
            {ready ? 'No messages yet. Say hi.' : 'Connecting...'}
          </div>
        ) : (
          messages.map(m => {
            const isOut = m.direction === 'out'
            return (
              <div key={m.msgId} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[70%] rounded-lg px-3 py-1.5 text-sm ${
                    isOut
                      ? 'bg-[#ff7a00] text-black rounded-br-sm'
                      : 'bg-[#221b16] text-[#f5ede4] rounded-bl-sm border border-[#2e261f]'
                  }`}
                >
                  <div className="break-words whitespace-pre-wrap">{m.text}</div>
                  <div className={`flex items-center justify-end gap-1 mt-0.5 text-[10px] ${
                    isOut ? 'text-black/60' : 'text-[#a39690]'
                  }`}>
                    <span>{formatTime(m.ts)}</span>
                    {isOut && <StatusTick status={m.status} />}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <footer className="border-t border-[#2e261f] bg-[#18130f] p-3 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSend() } }}
          placeholder={ready ? 'Type a message...' : 'Connect bee + wallet to chat'}
          disabled={!ready || sending}
          className="flex-1 bg-[#0d0a08] border border-[#2e261f] rounded-full px-4 py-2 text-sm text-[#f5ede4] placeholder:text-[#a39690] focus:outline-none focus:border-[#ff7a00] disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!ready || sending || !draft.trim()}
          className="px-5 bg-[#ff7a00] text-black text-sm font-semibold rounded-full hover:brightness-110 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </footer>
    </div>
  )
}
