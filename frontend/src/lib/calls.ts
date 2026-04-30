import type { Envelope, EnvelopeType, Hex, PeerProfile } from './types'

export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended'
export type CallDirection = 'outgoing' | 'incoming'
export type CallType = 'audio' | 'video'

export interface OfferPayload {
  callId: Hex
  sdp: string
  callType: CallType
}
export interface AnswerPayload {
  callId: Hex
  sdp: string
}
export interface IcePayload {
  callId: Hex
  /** Candidates are batched per spec §9 (every ~500 ms). */
  candidates: RTCIceCandidateInit[]
}
export interface HangupPayload {
  callId: Hex
  reason?: string
}

export interface Call {
  callId: Hex
  peer: PeerProfile
  direction: CallDirection
  state: CallState
  pc: RTCPeerConnection
  callType: CallType
  localStream?: MediaStream
  remoteStream?: MediaStream
  startedAt: number
  endedAt?: number
  hangupReason?: string
}

export interface CallSendFn {
  (peer: PeerProfile, type: Extract<EnvelopeType, 'call-offer' | 'call-answer' | 'ice' | 'call-hangup'>, payload: unknown): Promise<void>
}

export interface CallManagerOptions {
  send: CallSendFn
  resolvePeer: (wallet: Hex) => Promise<PeerProfile | null>
  iceServers?: RTCIceServer[]
  rtcFactory?: (config?: RTCConfiguration) => RTCPeerConnection
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  /** Batch ICE candidates over this window. Default 500 ms (spec §9). */
  iceBatchMs?: number
  setTimeoutFn?: (cb: () => void, ms: number) => unknown
  clearTimeoutFn?: (h: unknown) => void
  /** Random source used to mint the call id. Override in tests. */
  randomBytes?: (n: number) => Uint8Array
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
]

export type CallListener = (call: Call | null) => void
export type IncomingCallListener = (call: Call) => void

/**
 * Coordinates a single 1:1 WebRTC call. The signalling protocol uses the
 * existing PSS envelope types (`call-offer`, `call-answer`, `ice`,
 * `call-hangup`); this class just owns the state machine and ICE batching.
 */
export class CallManager {
  private current?: Call
  private candidateBuffer: RTCIceCandidateInit[] = []
  private flushTimer?: unknown
  private listeners = new Set<CallListener>()
  private incomingListeners = new Set<IncomingCallListener>()
  private remoteIceQueue: RTCIceCandidateInit[] = []
  private remoteDescSet = false

  private readonly setTimeoutFn: (cb: () => void, ms: number) => unknown
  private readonly clearTimeoutFn: (h: unknown) => void
  private readonly iceBatchMs: number

  constructor(private readonly opts: CallManagerOptions) {
    this.setTimeoutFn = opts.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms))
    this.clearTimeoutFn = opts.clearTimeoutFn ?? (h => clearTimeout(h as ReturnType<typeof setTimeout>))
    this.iceBatchMs = opts.iceBatchMs ?? 500
  }

  // -------- public API ----------------------------------------------------

  get currentCall(): Call | undefined { return this.current }

  onChange(cb: CallListener): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  onIncomingCall(cb: IncomingCallListener): () => void {
    this.incomingListeners.add(cb)
    return () => this.incomingListeners.delete(cb)
  }

  async startCall(peer: PeerProfile, callType: CallType = 'video'): Promise<Call> {
    if (this.current && this.current.state !== 'ended') {
      throw new Error('already in a call')
    }
    const callId = this.makeCallId()
    const pc = this.makePc()
    const localStream = await this.requestMedia(callType)
    for (const t of localStream.getTracks()) pc.addTrack(t, localStream)

    const call: Call = {
      callId, peer, direction: 'outgoing', state: 'calling',
      pc, callType, localStream, startedAt: Date.now(),
    }
    this.current = call
    this.attachPcHandlers(call)

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await this.opts.send(peer, 'call-offer', {
      callId, sdp: offer.sdp ?? '', callType,
    } satisfies OfferPayload)

    this.notify()
    return call
  }

  async acceptCall(): Promise<void> {
    const call = this.current
    if (!call || call.direction !== 'incoming' || call.state !== 'ringing') {
      throw new Error('no incoming call to accept')
    }
    const localStream = await this.requestMedia(call.callType)
    call.localStream = localStream
    for (const t of localStream.getTracks()) call.pc.addTrack(t, localStream)

    const answer = await call.pc.createAnswer()
    await call.pc.setLocalDescription(answer)
    await this.opts.send(call.peer, 'call-answer', {
      callId: call.callId, sdp: answer.sdp ?? '',
    } satisfies AnswerPayload)

    this.transition(call, 'connecting')
  }

  async rejectCall(): Promise<void> {
    const call = this.current
    if (!call || call.direction !== 'incoming') return
    await this.endCall('rejected')
  }

  async hangup(reason: string = 'user'): Promise<void> {
    if (!this.current) return
    await this.endCall(reason)
  }

  /** Mute / un-mute the microphone. */
  toggleAudio(enabled?: boolean): boolean {
    return this.toggleTracks('audio', enabled)
  }

  /** Turn the camera on / off. */
  toggleVideo(enabled?: boolean): boolean {
    return this.toggleTracks('video', enabled)
  }

  /** Dispatch an inbound `call-*` envelope into the state machine. */
  async handleSignaling(env: Envelope): Promise<void> {
    if (env.type === 'call-offer')   return this.onOffer(env)
    if (env.type === 'call-answer')  return this.onAnswer(env)
    if (env.type === 'ice')          return this.onIce(env)
    if (env.type === 'call-hangup')  return this.onHangup(env)
  }

  // -------- internals -----------------------------------------------------

  private async onOffer(env: Envelope): Promise<void> {
    const p = env.payload as OfferPayload | undefined
    if (!p?.callId || !p?.sdp) return

    // Busy: reject with a hangup so the caller hears immediately.
    if (this.current && this.current.state !== 'ended') {
      const peer = await this.opts.resolvePeer(env.from)
      if (peer) {
        await this.opts.send(peer, 'call-hangup', { callId: p.callId, reason: 'busy' } satisfies HangupPayload)
      }
      return
    }

    const peer = await this.opts.resolvePeer(env.from)
    if (!peer) return

    const pc = this.makePc()
    const call: Call = {
      callId: p.callId, peer, direction: 'incoming', state: 'ringing',
      pc, callType: p.callType ?? 'video', startedAt: Date.now(),
    }
    this.current = call
    this.attachPcHandlers(call)

    await pc.setRemoteDescription({ type: 'offer', sdp: p.sdp })
    this.remoteDescSet = true
    await this.flushQueuedRemoteIce(call)

    this.notify()
    for (const cb of this.incomingListeners) {
      try { cb(call) } catch { /* swallow */ }
    }
  }

  private async onAnswer(env: Envelope): Promise<void> {
    const call = this.current
    const p = env.payload as AnswerPayload | undefined
    if (!call || call.direction !== 'outgoing' || call.state !== 'calling') return
    if (!p?.callId || p.callId !== call.callId || !p.sdp) return

    await call.pc.setRemoteDescription({ type: 'answer', sdp: p.sdp })
    this.remoteDescSet = true
    await this.flushQueuedRemoteIce(call)

    this.transition(call, 'connecting')
  }

  private async onIce(env: Envelope): Promise<void> {
    const call = this.current
    const p = env.payload as IcePayload | undefined
    if (!call || !p?.callId || p.callId !== call.callId) return
    const list = Array.isArray(p.candidates) ? p.candidates : []
    if (!this.remoteDescSet) {
      this.remoteIceQueue.push(...list)
      return
    }
    for (const c of list) {
      try { await call.pc.addIceCandidate(c) } catch { /* malformed */ }
    }
  }

  private async flushQueuedRemoteIce(call: Call): Promise<void> {
    const queued = this.remoteIceQueue.splice(0)
    for (const c of queued) {
      try { await call.pc.addIceCandidate(c) } catch { /* */ }
    }
  }

  private async onHangup(env: Envelope): Promise<void> {
    const call = this.current
    const p = env.payload as HangupPayload | undefined
    if (!call) return
    if (p?.callId && p.callId !== call.callId) return
    this.cleanup(call, p?.reason ?? 'remote-hangup')
  }

  private attachPcHandlers(call: Call): void {
    call.pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
      if (e.candidate) {
        this.candidateBuffer.push(e.candidate.toJSON())
        this.scheduleIceFlush(call)
      }
    }
    call.pc.ontrack = (e: RTCTrackEvent) => {
      const stream = e.streams[0] ?? new MediaStream([e.track])
      call.remoteStream = stream
      this.notify()
    }
    call.pc.oniceconnectionstatechange = () => {
      if (call.state === 'ended') return
      const s = call.pc.iceConnectionState
      if (s === 'connected' || s === 'completed') this.transition(call, 'connected')
      else if (s === 'disconnected' || s === 'failed' || s === 'closed') {
        this.cleanup(call, `ice-${s}`)
      }
    }
  }

  private scheduleIceFlush(call: Call): void {
    if (this.flushTimer) return
    this.flushTimer = this.setTimeoutFn(() => {
      this.flushTimer = undefined
      const candidates = this.candidateBuffer.splice(0)
      if (candidates.length === 0) return
      this.opts.send(call.peer, 'ice', { callId: call.callId, candidates } satisfies IcePayload)
        .catch(() => { /* swallow; retried by next batch */ })
    }, this.iceBatchMs)
  }

  private async endCall(reason: string): Promise<void> {
    const call = this.current
    if (!call || call.state === 'ended') return
    try {
      await this.opts.send(call.peer, 'call-hangup', { callId: call.callId, reason } satisfies HangupPayload)
    } catch { /* best-effort */ }
    this.cleanup(call, reason)
  }

  private cleanup(call: Call, reason: string): void {
    if (call.state === 'ended') return
    call.state = 'ended'
    call.endedAt = Date.now()
    call.hangupReason = reason

    if (this.flushTimer) {
      this.clearTimeoutFn(this.flushTimer)
      this.flushTimer = undefined
    }
    this.candidateBuffer = []
    this.remoteIceQueue = []
    this.remoteDescSet = false

    try { call.pc.close() } catch { /* */ }
    for (const t of call.localStream?.getTracks() ?? []) {
      try { t.stop() } catch { /* */ }
    }

    this.notify()
    // After notifying, clear the active slot so a new call can start.
    if (this.current === call) this.current = undefined
    this.notify()
  }

  private transition(call: Call, state: CallState): void {
    if (call.state === state || call.state === 'ended') return
    call.state = state
    this.notify()
  }

  private notify(): void {
    const snapshot = this.current ?? null
    for (const cb of this.listeners) {
      try { cb(snapshot) } catch { /* swallow */ }
    }
  }

  private toggleTracks(kind: 'audio' | 'video', enabled?: boolean): boolean {
    const stream = this.current?.localStream
    if (!stream) return false
    let next = enabled ?? !stream.getTracks().some(t => t.kind === kind && t.enabled)
    for (const t of stream.getTracks()) if (t.kind === kind) t.enabled = next
    return next
  }

  private makePc(): RTCPeerConnection {
    const config: RTCConfiguration = { iceServers: this.opts.iceServers ?? DEFAULT_ICE_SERVERS }
    if (this.opts.rtcFactory) return this.opts.rtcFactory(config)
    return new RTCPeerConnection(config)
  }

  private async requestMedia(type: CallType): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: type === 'video',
    }
    if (this.opts.getUserMedia) return this.opts.getUserMedia(constraints)
    return navigator.mediaDevices.getUserMedia(constraints)
  }

  private makeCallId(): Hex {
    const bytes = this.opts.randomBytes
      ? this.opts.randomBytes(16)
      : (() => { const a = new Uint8Array(16); crypto.getRandomValues(a); return a })()
    let hex = '0x'
    for (const b of bytes) hex += b.toString(16).padStart(2, '0')
    return hex as Hex
  }
}
