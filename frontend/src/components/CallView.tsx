import { useEffect, useRef, useState } from 'react'
import { useMessenger } from '../contexts/MessengerContext'
import { useCall } from '../hooks/useCall'
import EnsName from './EnsName'

export default function CallView() {
  const { handles } = useMessenger()
  const call = useCall()
  const localRef = useRef<HTMLVideoElement>(null)
  const remoteRef = useRef<HTMLVideoElement>(null)
  const [audioOn, setAudioOn] = useState(true)
  const [videoOn, setVideoOn] = useState(true)

  useEffect(() => {
    if (localRef.current && call?.localStream) {
      localRef.current.srcObject = call.localStream
    }
  }, [call?.localStream])

  useEffect(() => {
    if (remoteRef.current && call?.remoteStream) {
      remoteRef.current.srcObject = call.remoteStream
    }
  }, [call?.remoteStream])

  if (!call || !handles) return null
  // Only show during active flow.
  if (call.state === 'idle' || call.state === 'ended') return null
  if (call.direction === 'incoming' && call.state === 'ringing') return null // modal handles ringing

  const labels: Record<string, string> = {
    calling: 'Ringing…',
    ringing: 'Ringing…',
    connecting: 'Connecting…',
    connected: 'Connected',
  }
  const stateLabel = labels[call.state] ?? ''

  return (
    <div className="fixed inset-0 z-40 bg-black flex flex-col">
      <header className="px-4 py-3 flex items-center gap-3 bg-[#0d0a08] border-b border-[#2e261f]">
        <div className="h-9 w-9 rounded-full bg-[#38302a] flex items-center justify-center text-[#ff7a00] font-semibold">
          {call.peer.wallet.slice(2, 3).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[#f5ede4] truncate">
            <EnsName address={call.peer.wallet} />
          </div>
          <div className="text-xs text-[#a39690]">{stateLabel}</div>
        </div>
      </header>

      <div className="flex-1 relative bg-black">
        {/* remote, full bleed */}
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
        {/* local, picture-in-picture */}
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-4 right-4 h-32 w-24 sm:h-40 sm:w-32 object-cover rounded border border-[#2e261f] bg-[#221b16]"
        />
      </div>

      <footer className="bg-[#0d0a08] border-t border-[#2e261f] py-4 flex items-center justify-center gap-3">
        <CtrlButton
          on={audioOn}
          onClick={() => setAudioOn(handles.calls.toggleAudio(!audioOn))}
          aria-label="toggle microphone"
          icon={<MicIcon muted={!audioOn} />}
        />
        {call.callType === 'video' && (
          <CtrlButton
            on={videoOn}
            onClick={() => setVideoOn(handles.calls.toggleVideo(!videoOn))}
            aria-label="toggle camera"
            icon={<CamIcon off={!videoOn} />}
          />
        )}
        <button
          onClick={() => handles.calls.hangup().catch(console.error)}
          aria-label="hang up"
          className="h-12 w-12 rounded-full bg-red-500 text-white flex items-center justify-center cursor-pointer hover:brightness-110"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 rotate-[135deg]" fill="currentColor">
            <path d="M21 15.46l-5.27-.61-1.61 1.61a12.06 12.06 0 0 1-5.58-5.58l1.61-1.61L9.54 4 4.6 4A1.6 1.6 0 0 0 3 5.6 17 17 0 0 0 18.4 21a1.6 1.6 0 0 0 1.6-1.6l-.01-3.94z" />
          </svg>
        </button>
      </footer>
    </div>
  )
}

function CtrlButton({ on, onClick, icon, ...rest }: { on: boolean; onClick: () => void; icon: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      onClick={onClick}
      className={`h-12 w-12 rounded-full flex items-center justify-center cursor-pointer ${
        on ? 'bg-[#221b16] text-[#f5ede4] hover:bg-[#2e261f]' : 'bg-[#f5ede4] text-black hover:brightness-95'
      }`}
    >
      {icon}
    </button>
  )
}

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
      {muted && <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" />}
    </svg>
  )
}

function CamIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      {off && <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" />}
    </svg>
  )
}
