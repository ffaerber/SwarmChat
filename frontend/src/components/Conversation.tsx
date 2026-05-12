import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useReadContract } from 'wagmi'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { CONTACT_REGISTRY_ABI, CONTACT_REGISTRY_ADDRESS } from '../config/contracts'
import { useConversation } from '../hooks/useConversation'
import { useMessenger } from '../contexts/MessengerContext'
import { useBlocklist } from '../hooks/useBlocklist'
import EnsName from './EnsName'
import MediaBubble from './MediaBubble'
import type { Hex } from '../lib/types'
import type { ChatMessage } from '../lib/messages-store'
import { MAX_UPLOAD_BYTES, MediaSizeError } from '../lib/media'

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

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isOut = msg.direction === 'out'
  const tone = isOut
    ? 'bg-[#ff7a00] text-black rounded-br-sm'
    : 'bg-[#221b16] text-[#f5ede4] rounded-bl-sm border border-[#2e261f]'
  const meta = isOut ? 'text-black/60' : 'text-[#a39690]'

  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[70%] rounded-lg px-3 py-1.5 text-sm ${tone}`}>
        {msg.kind === 'text' ? (
          <div className="break-words whitespace-pre-wrap">{msg.text}</div>
        ) : (
          <MediaBubble msg={msg} />
        )}
        <div className={`flex items-center justify-end gap-1 mt-0.5 text-[10px] ${meta}`}>
          <span>{formatTime(msg.ts)}</span>
          {isOut && <StatusTick status={msg.status} />}
        </div>
      </div>
    </div>
  )
}

export default function Conversation() {
  const { peer: peerParam } = useParams<{ peer: string }>()
  const peer = peerParam as Hex | undefined
  const { ready, handles } = useMessenger()
  const { messages, send } = useConversation(peer)
  const { isBlocked, block, unblock } = useBlocklist()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: profile } = useReadContract({
    address: CONTACT_REGISTRY_ADDRESS,
    abi: CONTACT_REGISTRY_ABI,
    functionName: 'getProfile',
    args: peer ? [peer] : undefined,
    query: { enabled: !!peer },
  })
  const displayName = Array.isArray(profile) ? (profile[0] as string) : ''
  const pssPubkey = Array.isArray(profile) ? (profile[1] as Hex) : undefined
  const swarmOverlay = Array.isArray(profile) ? (profile[2] as Hex) : undefined
  const updatedAt = Array.isArray(profile) ? Number(profile[3] as bigint) : 0
  const peerBlocked = peer ? isBlocked(peer) : false

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const handleFiles = async (files: File[]) => {
    if (!peer || !handles || !files.length) return
    for (const file of files) {
      try {
        if (file.size > MAX_UPLOAD_BYTES) {
          throw new MediaSizeError(file.size)
        }
        toast(`uploading ${file.name}…`)
        await handles.sendFile(peer, file)
      } catch (err) {
        if (err instanceof MediaSizeError) {
          toast.error(`${file.name} is over the ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB cap`)
        } else {
          toast.error(`upload failed: ${String(err)}`)
        }
      }
    }
  }

  const { getRootProps, getInputProps, isDragActive, open: openFilePicker } = useDropzone({
    onDrop: handleFiles,
    multiple: true,
    noClick: true,
    noKeyboard: true,
    disabled: !ready,
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length])

  const onPaste = async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.files)
    if (items.length === 0) return
    e.preventDefault()
    handleFiles(items)
  }

  if (!peer) return null

  const handleSend = async () => {
    if (!draft.trim() || sending) return
    setSending(true)
    try {
      await send(draft)
      setDraft('')
    } catch (err) {
      toast.error(`send failed: ${String(err)}`)
    } finally {
      setSending(false)
    }
  }

  const handleToggleBlock = async () => {
    if (!peer) return
    setMenuOpen(false)
    try {
      if (peerBlocked) {
        await unblock(peer)
        toast(`unblocked ${displayName || peer.slice(0, 8)}`)
      } else {
        await block(peer)
        toast(`blocked ${displayName || peer.slice(0, 8)} — incoming messages will be dropped`)
      }
    } catch (err) {
      toast.error(`failed: ${String(err)}`)
    }
  }

  const handleClearChat = async () => {
    if (!peer || !handles) return
    setMenuOpen(false)
    if (!confirm(`Delete all messages with ${displayName || peer.slice(0, 8)}? This only clears your local copy.`)) return
    try {
      await handles.messages.clearForPeer(peer)
      toast('chat cleared')
    } catch (err) {
      toast.error(`clear failed: ${String(err)}`)
    }
  }

  return (
    <div {...getRootProps()} className="flex-1 flex flex-col relative outline-none">
      <input {...getInputProps()} />

      {isDragActive && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#ff7a00]/10 border-2 border-dashed border-[#ff7a00] pointer-events-none">
          <div className="text-[#ff7a00] font-semibold">Drop to send</div>
        </div>
      )}

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
        <button
          onClick={() => handles?.resolvePeer(peer)
            .then(p => p && handles.calls.startCall(p, 'audio'))
            .catch(err => toast.error(`call failed: ${String(err)}`))}
          disabled={!ready}
          aria-label="audio call"
          className="h-9 w-9 flex items-center justify-center rounded-full text-[#a39690] hover:text-[#ff7a00] hover:bg-[#221b16] cursor-pointer disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </button>
        <button
          onClick={() => handles?.resolvePeer(peer)
            .then(p => p && handles.calls.startCall(p, 'video'))
            .catch(err => toast.error(`call failed: ${String(err)}`))}
          disabled={!ready}
          aria-label="video call"
          className="h-9 w-9 flex items-center justify-center rounded-full text-[#a39690] hover:text-[#ff7a00] hover:bg-[#221b16] cursor-pointer disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        </button>

        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="conversation menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="h-9 w-9 flex items-center justify-center rounded-full text-[#a39690] hover:text-[#ff7a00] hover:bg-[#221b16] cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <circle cx="12" cy="5" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="12" cy="19" r="1.6" />
            </svg>
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-10 z-20 w-52 bg-[#18130f] border border-[#2e261f] rounded shadow-lg py-1 text-sm">
              <button
                onClick={() => { setProfileOpen(o => !o); setMenuOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-[#f5ede4] hover:bg-[#221b16] cursor-pointer"
              >
                {profileOpen ? 'Hide profile' : 'View profile'}
              </button>
              <button
                onClick={handleToggleBlock}
                className="w-full text-left px-3 py-1.5 text-[#f5ede4] hover:bg-[#221b16] cursor-pointer"
              >
                {peerBlocked ? 'Unblock user' : 'Block user'}
              </button>
              <button
                onClick={handleClearChat}
                className="w-full text-left px-3 py-1.5 text-red-400 hover:bg-[#221b16] cursor-pointer"
              >
                Clear chat history
              </button>
            </div>
          )}
        </div>
      </header>

      {profileOpen && (
        <div className="border-b border-[#2e261f] bg-[#18130f] px-4 py-3 text-xs text-[#a39690] space-y-1">
          <div><span className="text-[#f5ede4] font-medium">{displayName || '(no display name)'}</span></div>
          <div className="font-mono break-all">addr: {peer}</div>
          {pssPubkey && <div className="font-mono break-all">pss:  {pssPubkey}</div>}
          {swarmOverlay && <div className="font-mono break-all">overlay: {swarmOverlay}</div>}
          {updatedAt > 0 && <div>updated: {new Date(updatedAt * 1000).toLocaleString()}</div>}
          {peerBlocked && <div className="text-red-400">⚠ blocked — incoming messages dropped</div>}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#0d0a08]">
        {messages.length === 0 ? (
          <div className="text-center text-xs text-[#a39690] mt-8">
            {ready ? 'No messages yet. Say hi or drop a file.' : 'Connecting…'}
          </div>
        ) : (
          messages.map(m => <MessageBubble key={m.msgId} msg={m} />)
        )}
      </div>

      <footer className="border-t border-[#2e261f] bg-[#18130f] p-3 flex gap-2 items-center">
        <button
          onClick={openFilePicker}
          disabled={!ready}
          aria-label="attach file"
          className="h-9 w-9 flex items-center justify-center rounded-full text-[#a39690] hover:text-[#ff7a00] hover:bg-[#221b16] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSend() } }}
          onPaste={onPaste}
          placeholder={ready ? 'Type a message or drop a file…' : 'Connect bee + wallet to chat'}
          disabled={!ready || sending}
          className="flex-1 bg-[#0d0a08] border border-[#2e261f] rounded-full px-4 py-2 text-sm text-[#f5ede4] placeholder:text-[#a39690] focus:outline-none focus:border-[#ff7a00] disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!ready || sending || !draft.trim()}
          className="px-5 h-9 bg-[#ff7a00] text-black text-sm font-semibold rounded-full hover:brightness-110 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </footer>
    </div>
  )
}
