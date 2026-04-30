import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CallManager } from '../../src/lib/calls'
import type { Envelope, Hex, PeerProfile } from '../../src/lib/types'

const ALICE: Hex = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex
const BOB:   Hex = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex

const aliceProfile: PeerProfile = {
  wallet: ALICE,
  pssPublicKey: ('0x02' + 'aa'.repeat(32)) as Hex,
  swarmOverlay: ('0x' + 'aa'.repeat(32)) as Hex,
}
const bobProfile: PeerProfile = {
  wallet: BOB,
  pssPublicKey: ('0x02' + 'bb'.repeat(32)) as Hex,
  swarmOverlay: ('0x' + 'bb'.repeat(32)) as Hex,
}

interface SentSignal {
  to: PeerProfile
  type: 'call-offer' | 'call-answer' | 'ice' | 'call-hangup'
  payload: any
}

class FakePeerConnection {
  iceConnectionState: RTCIceConnectionState = 'new'
  signalingState: RTCSignalingState = 'stable'
  localDescription: RTCSessionDescriptionInit | null = null
  remoteDescription: RTCSessionDescriptionInit | null = null
  added: RTCIceCandidateInit[] = []
  closed = false

  onicecandidate: ((e: any) => void) | null = null
  ontrack: ((e: any) => void) | null = null
  oniceconnectionstatechange: (() => void) | null = null
  onconnectionstatechange: (() => void) | null = null

  addTrack(_t: any, _s?: any) {}
  async createOffer(): Promise<RTCSessionDescriptionInit> { return { type: 'offer', sdp: 'v=0\r\nm=offer\r\n' } }
  async createAnswer(): Promise<RTCSessionDescriptionInit> { return { type: 'answer', sdp: 'v=0\r\nm=answer\r\n' } }
  async setLocalDescription(d: RTCSessionDescriptionInit) { this.localDescription = d }
  async setRemoteDescription(d: RTCSessionDescriptionInit) { this.remoteDescription = d }
  async addIceCandidate(c: RTCIceCandidateInit) { this.added.push(c) }
  close() { this.closed = true }

  /** Helpers used by the tests to simulate ICE/track events. */
  emitCandidate(candidate: RTCIceCandidateInit) {
    this.onicecandidate?.({ candidate: { toJSON: () => candidate } })
  }
  setIceConnectionState(state: RTCIceConnectionState) {
    this.iceConnectionState = state
    this.oniceconnectionstatechange?.()
  }
  emitTrack(stream: MediaStream) {
    this.ontrack?.({ streams: [stream], track: stream.getTracks()[0] })
  }
}

function fakeStream(): MediaStream {
  // Minimal MediaStream substitute that satisfies the bits the manager touches.
  const tracks: any[] = [
    { kind: 'audio', enabled: true, stop: vi.fn() },
    { kind: 'video', enabled: true, stop: vi.fn() },
  ]
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter(t => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter(t => t.kind === 'video'),
  } as unknown as MediaStream
}

interface Harness {
  manager: CallManager
  sent: SentSignal[]
  pcs: FakePeerConnection[]
  resolveBob: (w: Hex) => Promise<PeerProfile | null>
  flushIceTimer: () => void
}

function harness(): Harness {
  vi.useFakeTimers()
  const sent: SentSignal[] = []
  const pcs: FakePeerConnection[] = []

  const manager = new CallManager({
    send: async (to, type, payload) => { sent.push({ to, type, payload: payload as any }) },
    resolvePeer: async w => (w.toLowerCase() === ALICE.toLowerCase() ? aliceProfile : null),
    rtcFactory: () => {
      const pc = new FakePeerConnection()
      pcs.push(pc)
      return pc as unknown as RTCPeerConnection
    },
    getUserMedia: async () => fakeStream(),
    iceBatchMs: 100,
  })

  return {
    manager,
    sent,
    pcs,
    resolveBob: async () => bobProfile,
    flushIceTimer: () => vi.advanceTimersByTime(120),
  }
}

function envelope(type: Envelope['type'], from: Hex, payload: unknown): Envelope {
  return {
    v: 1, type,
    msgId: ('0x' + '11'.repeat(32)) as Hex,
    from, to: BOB, feedOwner: ('0x' + 'a1'.repeat(20)) as Hex,
    ts: 1, nonce: ('0x' + '00'.repeat(16)) as Hex,
    payload, sig: ('0x' + '00'.repeat(65)) as Hex,
  }
}

describe('CallManager — outgoing flow', () => {
  let h: Harness
  beforeEach(() => { h = harness() })

  it('startCall creates a peer connection, sends call-offer, transitions calling', async () => {
    const call = await h.manager.startCall(bobProfile, 'video')
    expect(call.state).toBe('calling')
    expect(call.direction).toBe('outgoing')
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0].type).toBe('call-offer')
    expect(h.sent[0].payload.callId).toBe(call.callId)
    expect(h.sent[0].payload.callType).toBe('video')
    expect(h.pcs[0].localDescription?.type).toBe('offer')
  })

  it('on call-answer envelope, applies remote description and transitions to connecting', async () => {
    const call = await h.manager.startCall(bobProfile)
    await h.manager.handleSignaling(envelope('call-answer', BOB, {
      callId: call.callId, sdp: 'v=0\r\nm=answer\r\n',
    }))
    expect(call.state).toBe('connecting')
    expect(h.pcs[0].remoteDescription?.type).toBe('answer')
  })

  it('batches local ICE candidates over the configured window', async () => {
    const call = await h.manager.startCall(bobProfile)
    h.pcs[0].emitCandidate({ candidate: 'c1', sdpMid: '0', sdpMLineIndex: 0 })
    h.pcs[0].emitCandidate({ candidate: 'c2', sdpMid: '0', sdpMLineIndex: 0 })
    expect(h.sent.filter(s => s.type === 'ice')).toHaveLength(0) // not flushed yet
    h.flushIceTimer()
    const ice = h.sent.filter(s => s.type === 'ice')
    expect(ice).toHaveLength(1)
    expect(ice[0].payload.callId).toBe(call.callId)
    expect(ice[0].payload.candidates).toHaveLength(2)
  })

  it('queues remote ICE candidates that arrive before remote description, then flushes', async () => {
    const call = await h.manager.startCall(bobProfile)
    // Remote ICE arrives first (race with answer)
    await h.manager.handleSignaling(envelope('ice', BOB, {
      callId: call.callId,
      candidates: [{ candidate: 'remote-1' }, { candidate: 'remote-2' }],
    }))
    expect(h.pcs[0].added).toHaveLength(0)
    // Now the answer lands → buffered ICE applied
    await h.manager.handleSignaling(envelope('call-answer', BOB, {
      callId: call.callId, sdp: 'v=0\r\nm=answer\r\n',
    }))
    expect(h.pcs[0].added).toHaveLength(2)
  })

  it('hangup sends call-hangup and tears down', async () => {
    const call = await h.manager.startCall(bobProfile)
    await h.manager.hangup('user')
    const hang = h.sent.find(s => s.type === 'call-hangup')
    expect(hang).toBeDefined()
    expect(hang!.payload.reason).toBe('user')
    expect(call.state).toBe('ended')
    expect(h.pcs[0].closed).toBe(true)
    expect(h.manager.currentCall).toBeUndefined()
  })

  it('ICE-connection state "connected" transitions the call to connected', async () => {
    const call = await h.manager.startCall(bobProfile)
    await h.manager.handleSignaling(envelope('call-answer', BOB, {
      callId: call.callId, sdp: 'v=0',
    }))
    h.pcs[0].setIceConnectionState('connected')
    expect(call.state).toBe('connected')
  })
})

describe('CallManager — incoming flow', () => {
  let h: Harness
  beforeEach(() => { h = harness() })

  it('on call-offer: enters ringing and notifies incoming-call listeners', async () => {
    const incoming: any[] = []
    h.manager.onIncomingCall(c => incoming.push(c))

    await h.manager.handleSignaling(envelope('call-offer', ALICE, {
      callId: ('0x' + 'cc'.repeat(16)) as Hex,
      sdp: 'v=0',
      callType: 'audio',
    }))
    expect(incoming).toHaveLength(1)
    expect(h.manager.currentCall?.state).toBe('ringing')
    expect(h.manager.currentCall?.direction).toBe('incoming')
    expect(h.manager.currentCall?.callType).toBe('audio')
  })

  it('acceptCall sends call-answer and transitions to connecting', async () => {
    await h.manager.handleSignaling(envelope('call-offer', ALICE, {
      callId: ('0x' + 'cc'.repeat(16)) as Hex,
      sdp: 'v=0',
      callType: 'video',
    }))
    await h.manager.acceptCall()
    const ans = h.sent.find(s => s.type === 'call-answer')
    expect(ans).toBeDefined()
    expect(h.manager.currentCall?.state).toBe('connecting')
  })

  it('rejectCall sends call-hangup and ends the call', async () => {
    await h.manager.handleSignaling(envelope('call-offer', ALICE, {
      callId: ('0x' + 'dd'.repeat(16)) as Hex,
      sdp: 'v=0',
      callType: 'video',
    }))
    await h.manager.rejectCall()
    expect(h.sent.some(s => s.type === 'call-hangup' && s.payload.reason === 'rejected')).toBe(true)
    expect(h.manager.currentCall).toBeUndefined()
  })

  it('inbound call-offer while busy is rejected with reason=busy', async () => {
    await h.manager.startCall(bobProfile)
    await h.manager.handleSignaling(envelope('call-offer', ALICE, {
      callId: ('0x' + 'ee'.repeat(16)) as Hex,
      sdp: 'v=0',
      callType: 'video',
    }))
    const busy = h.sent.find(s => s.type === 'call-hangup' && s.payload.reason === 'busy')
    expect(busy).toBeDefined()
  })

  it('remote call-hangup ends the call locally', async () => {
    await h.manager.handleSignaling(envelope('call-offer', ALICE, {
      callId: ('0x' + 'ff'.repeat(16)) as Hex,
      sdp: 'v=0', callType: 'video',
    }))
    const callId = h.manager.currentCall!.callId
    await h.manager.handleSignaling(envelope('call-hangup', ALICE, {
      callId, reason: 'remote',
    }))
    expect(h.manager.currentCall).toBeUndefined()
  })
})

describe('CallManager — track + media controls', () => {
  let h: Harness
  beforeEach(() => { h = harness() })

  it('ontrack sets remoteStream', async () => {
    const call = await h.manager.startCall(bobProfile)
    await h.manager.handleSignaling(envelope('call-answer', BOB, {
      callId: call.callId, sdp: 'v=0',
    }))
    const stream = fakeStream()
    h.pcs[0].emitTrack(stream)
    expect(call.remoteStream).toBe(stream)
  })

  it('toggleAudio mutes/unmutes audio tracks on the local stream', async () => {
    const call = await h.manager.startCall(bobProfile)
    const audio = call.localStream!.getAudioTracks()[0] as any
    expect(audio.enabled).toBe(true)
    h.manager.toggleAudio(false)
    expect(audio.enabled).toBe(false)
    h.manager.toggleAudio(true)
    expect(audio.enabled).toBe(true)
  })
})
