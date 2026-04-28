import { useEffect, useState } from 'react'
import { useMessenger } from '../contexts/MessengerContext'
import type { MediaMessage } from '../lib/messages-store'

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function MediaBubble({ msg }: { msg: MediaMessage }) {
  const { handles } = useMessenger()
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!handles) return
    let cancelled = false
    handles.resolveMedia
      .resolve(msg.ref)
      .then(u => { if (!cancelled) setUrl(u) })
      .catch(err => { if (!cancelled) setError(String(err)) })
    return () => { cancelled = true }
  }, [handles, msg.ref])

  if (msg.kind === 'image') {
    if (error) return <Placeholder label={`failed: ${error}`} />
    if (!url) return <Placeholder label="loading…" w={msg.w} h={msg.h} />
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img
          src={url}
          alt={msg.name ?? 'image'}
          width={msg.w}
          height={msg.h}
          className="max-w-[320px] max-h-[320px] rounded object-cover"
          loading="lazy"
        />
      </a>
    )
  }

  if (msg.kind === 'video') {
    if (error) return <Placeholder label={`failed: ${error}`} />
    if (!url) return <Placeholder label="loading…" />
    return (
      <video
        src={url}
        controls
        preload="metadata"
        className="max-w-[320px] max-h-[320px] rounded"
      />
    )
  }

  // Generic file chip.
  return (
    <a
      href={url ?? undefined}
      download={msg.name}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 py-1"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <div className="min-w-0">
        <div className="text-sm truncate">{msg.name}</div>
        <div className="text-[10px] opacity-70">{fmtSize(msg.size)} · {msg.mime}</div>
      </div>
    </a>
  )
}

function Placeholder({ label, w, h }: { label: string; w?: number; h?: number }) {
  const ratio = w && h ? `${w}/${h}` : '4/3'
  return (
    <div
      className="flex items-center justify-center bg-black/20 rounded text-[10px] opacity-70"
      style={{ aspectRatio: ratio, minWidth: 160 }}
    >
      {label}
    </div>
  )
}
