import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { useGroupConversation } from '../hooks/useGroupConversation'
import { useMessenger } from '../contexts/MessengerContext'
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
  if (status === 'read' || status === 'delivered') return <span>✓✓</span>
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
        {!isOut && (
          <div className="text-[10px] font-mono opacity-70 mb-0.5">
            <EnsName address={msg.peer} />
          </div>
        )}
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

export default function GroupConversation() {
  const { id } = useParams<{ id: string }>()
  const groupId = id as Hex | undefined
  const { ready, handles } = useMessenger()
  const { messages, group, send } = useGroupConversation(groupId)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleFiles = async (files: File[]) => {
    if (!groupId || !handles || !files.length) return
    for (const file of files) {
      try {
        if (file.size > MAX_UPLOAD_BYTES) throw new MediaSizeError(file.size)
        toast(`uploading ${file.name}…`)
        await handles.sendFileToGroup(groupId, file)
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

  if (!groupId) return null

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
          #
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[#f5ede4] truncate">
            {group?.name ?? 'Group'}
          </div>
          <div className="text-xs text-[#a39690] truncate">
            {group ? `${group.members.length} member${group.members.length === 1 ? '' : 's'}` : '—'}
          </div>
        </div>
      </header>

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
          placeholder={ready ? 'Message the group…' : 'Connect bee + wallet to chat'}
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
