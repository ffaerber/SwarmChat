import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { Transport } from '../lib/transport'
import { Reliability } from '../lib/reliability'
import { Feeds } from '../lib/feeds'
import { IndexedDBOutbox } from '../lib/idb-outbox'
import { IndexedDBMessages } from '../lib/idb-messages'
import { IndexedDBGroups, makeGroupId, randomGroupNonce } from '../lib/groups-store'
import { deriveFeedKey } from '../lib/feed-key'
import { uploadMedia, MediaResolver, classifyMime } from '../lib/media'
import type { UploadResult } from '../lib/media'
import { CallManager } from '../lib/calls'
import { useBeeContext } from '../hooks/BeeContext'
import { CONTACT_REGISTRY_ABI, CONTACT_REGISTRY_ADDRESS } from '../config/contracts'
import type { Envelope, Group, Hex, MsgPayload, PeerProfile, SwarmRef } from '../lib/types'
import type { ChatMessage } from '../lib/messages-store'

interface MessengerHandles {
  reliability: Reliability
  messages: IndexedDBMessages
  groups: IndexedDBGroups
  feedIdentity: { privateKey: Hex; address: Hex }
  resolvePeer: (wallet: Hex) => Promise<PeerProfile | null>
  resolveMedia: MediaResolver
  calls: CallManager
  send: (to: Hex, text: string) => Promise<void>
  sendFile: (to: Hex, file: File) => Promise<void>
  /** Create a group (off-chain), persist locally, fan out group/state to members. */
  createGroup: (name: string, members: Hex[]) => Promise<Group>
  /** Send a text message to every member of a group (excluding self). */
  sendToGroup: (groupId: Hex, text: string) => Promise<void>
  /** Send a file to every member of a group (excluding self). */
  sendFileToGroup: (groupId: Hex, file: File) => Promise<void>
}

interface MessengerContextValue {
  /** Ready to send/receive (everything wired up). */
  ready: boolean
  /** Best-effort status string for the onboarding modal. */
  status: string
  /** Trigger the wallet sign that derives the feed key. */
  deriveAndStart: () => Promise<void>
  handles: MessengerHandles | null
}

const Ctx = createContext<MessengerContextValue | null>(null)

const FEED_CACHE_KEY = (wallet: string) => `swarmchat:feed:${wallet.toLowerCase()}`

/** Coerce inbound envelope payload to a ChatMessage row. Tolerates legacy { text } shape. */
function payloadToChatMessage(env: Envelope, peer: Hex, direction: 'in' | 'out'): ChatMessage | null {
  const p = env.payload as MsgPayload | { text?: string } | undefined
  if (!p) return null
  const base = {
    msgId: env.msgId,
    peer,
    direction,
    ts: env.ts,
    ...(env.groupId ? { groupId: env.groupId } : {}),
  } as const

  if ('kind' in p) {
    if (p.kind === 'text') return { ...base, kind: 'text', text: p.text }
    if (p.kind === 'image' || p.kind === 'video' || p.kind === 'file') {
      return {
        ...base,
        kind: p.kind,
        ref: p.ref,
        mime: p.mime,
        size: p.size,
        name: 'name' in p ? p.name : undefined,
        w: 'w' in p ? p.w : undefined,
        h: 'h' in p ? p.h : undefined,
        durationMs: 'durationMs' in p ? p.durationMs : undefined,
      } as ChatMessage
    }
  }
  // Legacy { text } shape from earlier builds.
  if (typeof (p as { text?: string }).text === 'string') {
    return { ...base, kind: 'text', text: (p as { text: string }).text }
  }
  return null
}

/** Returns true iff the payload is a group/state control message. */
function isGroupStatePayload(payload: unknown): payload is { kind: 'group/state'; group: Group } {
  return !!payload
    && typeof payload === 'object'
    && (payload as { kind?: unknown }).kind === 'group/state'
    && !!(payload as { group?: unknown }).group
}

function uploadResultToPayload(u: UploadResult): MsgPayload {
  if (u.kind === 'image') return { kind: 'image', ref: u.ref, mime: u.mime, size: u.size, name: u.name, w: u.w, h: u.h }
  if (u.kind === 'video') return { kind: 'video', ref: u.ref, mime: u.mime, size: u.size, name: u.name, durationMs: u.durationMs }
  return { kind: 'file', ref: u.ref, mime: u.mime, size: u.size, name: u.name }
}

export function MessengerProvider({ children }: { children: ReactNode }) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const bee = useBeeContext()

  const [feedIdentity, setFeedIdentity] = useState<{ privateKey: Hex; address: Hex } | null>(null)
  const [handles, setHandles] = useState<MessengerHandles | null>(null)
  const [status, setStatus] = useState('idle')

  // Restore cached feed identity for this wallet.
  useEffect(() => {
    if (!address) { setFeedIdentity(null); return }
    const cached = localStorage.getItem(FEED_CACHE_KEY(address))
    if (cached) {
      try { setFeedIdentity(JSON.parse(cached)) } catch { /* corrupt cache */ }
    }
  }, [address])

  const deriveAndStart = async () => {
    if (!address) throw new Error('connect wallet first')
    if (!walletClient) throw new Error('wallet client not ready')
    setStatus('deriving feed key...')
    const id = await deriveFeedKey(m => walletClient.signMessage({ message: m }))
    localStorage.setItem(FEED_CACHE_KEY(address), JSON.stringify(id))
    setFeedIdentity(id)
  }

  // Peer profile cache so we don't hit the contract on every send.
  const peerCacheRef = useRef(new Map<string, PeerProfile>())

  const resolvePeer = async (wallet: Hex): Promise<PeerProfile | null> => {
    if (!publicClient) return null
    const key = wallet.toLowerCase()
    const cached = peerCacheRef.current.get(key)
    if (cached) return cached
    try {
      const profile = (await publicClient.readContract({
        address: CONTACT_REGISTRY_ADDRESS,
        abi: CONTACT_REGISTRY_ABI,
        functionName: 'getProfile',
        args: [wallet],
      })) as readonly [string, Hex, Hex, bigint, boolean]
      const [, pssPublicKey, swarmOverlay, , active] = profile
      if (!active) return null
      const peer: PeerProfile = { wallet, pssPublicKey, swarmOverlay }
      peerCacheRef.current.set(key, peer)
      return peer
    } catch {
      return null
    }
  }

  // Build the messenger when every prerequisite is in place.
  useEffect(() => {
    if (!address || !walletClient || !bee.isConnected || !bee.batchId
        || !bee.pssPublicKey || !bee.swarmOverlay || !feedIdentity) {
      return
    }

    let cancelled = false
    setStatus('starting messenger...')

    const outbox = new IndexedDBOutbox({ dbName: `swarmchat-outbox-${address.toLowerCase()}` })
    const messages = new IndexedDBMessages({ dbName: `swarmchat-messages-${address.toLowerCase()}` })
    const groups = new IndexedDBGroups({ dbName: `swarmchat-groups-${address.toLowerCase()}` })
    const resolveMedia = new MediaResolver(bee.writer)

    const transport = new Transport({
      bee: bee.writer,
      selfWallet: address as Hex,
      selfFeedOwner: feedIdentity.address,
      signMessage: m => walletClient.signMessage({ message: m }),
      postageBatchId: bee.batchId,
    })

    const feeds = new Feeds({
      bee: bee.writer,
      selfWallet: address as Hex,
      feedPrivateKey: feedIdentity.privateKey,
      postageBatchId: bee.batchId,
    })

    const reliability = new Reliability({
      transport,
      outbox,
      feeds,
      resolveProfile: w => resolvePeer(w as Hex),
    })

    const calls = new CallManager({
      send: (peer, type, payload) =>
        reliability.send({ to: peer, type, payload }).then(() => undefined),
      resolvePeer: w => resolvePeer(w as Hex),
    })

    // Inbound: persist + reflect in UI; also dispatch call signaling.
    reliability.onIncomingMessage(async (env: Envelope) => {
      if (env.type === 'call-offer' || env.type === 'call-answer'
          || env.type === 'ice'    || env.type === 'call-hangup') {
        calls.handleSignaling(env).catch(err => console.error('call signaling', err))
        return
      }
      if (env.type !== 'msg') return
      // Group control messages: update the local groups store, don't show in chat.
      if (isGroupStatePayload(env.payload)) {
        try { await groups.put(env.payload.group) } catch (err) { console.error('group/state', err) }
        return
      }
      const msg = payloadToChatMessage(env, env.from as Hex, 'in')
      if (!msg) return
      const lower = (env.from.toLowerCase() as Hex)
      if (!peerCacheRef.current.has(lower)) {
        resolvePeer(env.from as Hex).catch(() => {})
      }
      await messages.put(msg)
    })

    // Outbound status changes (sent → delivered → read → failed).
    reliability.onStatus(entry => {
      if (entry.envelope.type !== 'msg') return
      const next = entry.status === 'pending' ? 'sent' : entry.status
      messages.updateStatus(entry.envelope.msgId, next).catch(() => {})
    })

    const sendPayload = async (to: Hex, payload: MsgPayload, clientRow: ChatMessage) => {
      const peer = await resolvePeer(to)
      if (!peer) throw new Error(`peer ${to} is not registered`)
      const entry = await reliability.send({ to: peer, type: 'msg', payload })
      const persisted: ChatMessage = { ...clientRow, msgId: entry.envelope.msgId, ts: entry.envelope.ts, status: 'sent' }
      await messages.put(persisted)
    }

    /** Fan-out: encrypt and send the same payload to every member except self. */
    const fanOutToGroup = async (group: Group, payload: unknown) => {
      const me = address.toLowerCase()
      const recipients = group.members.filter(m => m.toLowerCase() !== me)
      const profiles = await Promise.all(recipients.map(m => resolvePeer(m)))
      const live = profiles
        .map((p, i) => ({ p, wallet: recipients[i] }))
        .filter((x): x is { p: PeerProfile; wallet: Hex } => !!x.p)
      const unreachable = recipients.length - live.length
      if (unreachable > 0) {
        console.warn(`group fan-out: ${unreachable}/${recipients.length} member(s) unreachable`)
      }
      const sends = live.map(({ p }) =>
        reliability.send({ to: p, type: 'msg', payload, groupId: group.id })
          .catch(err => { console.error('group fan-out send', err); return null })
      )
      return Promise.all(sends)
    }

    const sendGroupPayload = async (
      groupId: Hex,
      payload: MsgPayload,
      clientRow: ChatMessage,
    ) => {
      const group = await groups.get(groupId)
      if (!group) throw new Error(`unknown group ${groupId}`)
      const results = await fanOutToGroup(group, payload)
      // Use the first successful envelope's msgId/ts for the local row.
      const first = results.find(r => r !== null)
      const ts = first?.envelope.ts ?? Date.now()
      const msgId = (first?.envelope.msgId ?? ('0x' + '0'.repeat(64))) as Hex
      const persisted: ChatMessage = {
        ...clientRow,
        msgId,
        ts,
        peer: address as Hex,  // sender = self for outgoing
        groupId,
        status: 'sent',
      }
      await messages.put(persisted)
    }

    const createGroup = async (name: string, members: Hex[]): Promise<Group> => {
      const me = address as Hex
      const memberSet = new Map<string, Hex>()
      memberSet.set(me.toLowerCase(), me)
      for (const m of members) memberSet.set(m.toLowerCase(), m)
      const group: Group = {
        id: makeGroupId(me, randomGroupNonce()),
        name: name.trim() || 'Untitled group',
        members: [...memberSet.values()],
        admin: me,
        createdAt: Date.now(),
        version: 1,
      }
      await groups.put(group)
      // Fan-out group/state to every other member; admin already has it locally.
      await fanOutToGroup(group, { kind: 'group/state', group })
      return group
    }

    reliability.start().then(() => {
      if (cancelled) return
      setHandles({
        reliability,
        messages,
        groups,
        feedIdentity,
        resolvePeer,
        resolveMedia,
        calls,
        send: async (to, text) => {
          const stub: ChatMessage = {
            msgId: ('0x' + '0'.repeat(64)) as Hex, // overwritten with real msgId in sendPayload
            peer: to, direction: 'out', ts: Date.now(), kind: 'text', text, status: 'sent',
          }
          await sendPayload(to, { kind: 'text', text }, stub)
        },
        sendFile: async (to, file) => {
          if (!bee.batchId) throw new Error('no postage stamp selected')
          const upload = await uploadMedia(bee.writer, bee.batchId, file)
          const payload = uploadResultToPayload(upload)
          const kind = classifyMime(upload.mime)
          const stub: ChatMessage = {
            msgId: ('0x' + '0'.repeat(64)) as Hex,
            peer: to, direction: 'out', ts: Date.now(),
            kind,
            ref: upload.ref as SwarmRef,
            mime: upload.mime,
            size: upload.size,
            name: upload.name,
            w: upload.w,
            h: upload.h,
            durationMs: upload.durationMs,
            status: 'sent',
          } as ChatMessage
          await sendPayload(to, payload, stub)
        },
        createGroup,
        sendToGroup: async (groupId, text) => {
          const stub: ChatMessage = {
            msgId: ('0x' + '0'.repeat(64)) as Hex, // overwritten in sendGroupPayload
            peer: address as Hex,
            direction: 'out',
            ts: Date.now(),
            kind: 'text',
            text,
            status: 'sent',
            groupId,
          }
          await sendGroupPayload(groupId, { kind: 'text', text }, stub)
        },
        sendFileToGroup: async (groupId, file) => {
          if (!bee.batchId) throw new Error('no postage stamp selected')
          const upload = await uploadMedia(bee.writer, bee.batchId, file)
          const payload = uploadResultToPayload(upload)
          const kind = classifyMime(upload.mime)
          const stub: ChatMessage = {
            msgId: ('0x' + '0'.repeat(64)) as Hex,
            peer: address as Hex,
            direction: 'out',
            ts: Date.now(),
            kind,
            ref: upload.ref as SwarmRef,
            mime: upload.mime,
            size: upload.size,
            name: upload.name,
            w: upload.w,
            h: upload.h,
            durationMs: upload.durationMs,
            status: 'sent',
            groupId,
          } as ChatMessage
          await sendGroupPayload(groupId, payload, stub)
        },
      })
      setStatus('ready')
    }).catch(err => {
      if (cancelled) return
      setStatus(`failed to start: ${String(err)}`)
    })

    return () => {
      cancelled = true
      calls.hangup('cleanup').catch(() => {})
      reliability.stop()
      resolveMedia.dispose()
      messages.close().catch(() => {})
      groups.close().catch(() => {})
      outbox.close().catch(() => {})
    }
  }, [address, walletClient, bee.isConnected, bee.batchId, bee.pssPublicKey, bee.swarmOverlay, feedIdentity, bee.writer])

  const value = useMemo<MessengerContextValue>(
    () => ({ ready: !!handles, status, deriveAndStart, handles }),
    [handles, status],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useMessenger(): MessengerContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMessenger must be inside MessengerProvider')
  return v
}
