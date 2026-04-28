import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { Transport } from '../lib/transport'
import { Reliability } from '../lib/reliability'
import { Feeds } from '../lib/feeds'
import { IndexedDBOutbox } from '../lib/idb-outbox'
import { IndexedDBMessages } from '../lib/idb-messages'
import { deriveFeedKey } from '../lib/feed-key'
import { useBeeContext } from '../hooks/BeeContext'
import { CONTACT_REGISTRY_ABI, CONTACT_REGISTRY_ADDRESS } from '../config/contracts'
import type { Envelope, Hex, PeerProfile } from '../lib/types'

interface MessengerHandles {
  reliability: Reliability
  messages: IndexedDBMessages
  feedIdentity: { privateKey: Hex; address: Hex }
  resolvePeer: (wallet: Hex) => Promise<PeerProfile | null>
  send: (to: Hex, text: string) => Promise<void>
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

    // Inbound: persist + reflect in UI.
    reliability.onIncomingMessage(async (env: Envelope) => {
      if (env.type !== 'msg') return
      const text = (env.payload as { text?: string })?.text ?? ''
      const lower = (env.from.toLowerCase() as Hex)
      // remember the peer's feedOwner the first time we see it
      if (!peerCacheRef.current.has(lower)) {
        // Don't block on the registry lookup; the messages list does not need it.
        resolvePeer(env.from as Hex).catch(() => {})
      }
      await messages.put({
        msgId: env.msgId,
        peer: env.from as Hex,
        direction: 'in',
        text,
        ts: env.ts,
      })
    })

    // Outbound status changes (sent → delivered → read → failed).
    reliability.onStatus(entry => {
      if (entry.envelope.type !== 'msg') return
      messages.updateStatus(entry.envelope.msgId, entry.status === 'pending' ? 'sent' : entry.status).catch(() => {})
    })

    reliability.start().then(() => {
      if (cancelled) return
      setHandles({
        reliability,
        messages,
        feedIdentity,
        resolvePeer,
        send: async (to, text) => {
          const peer = await resolvePeer(to)
          if (!peer) throw new Error(`peer ${to} is not registered`)
          const entry = await reliability.send({
            to: peer,
            type: 'msg',
            payload: { text },
          })
          await messages.put({
            msgId: entry.envelope.msgId,
            peer: to,
            direction: 'out',
            text,
            ts: entry.envelope.ts,
            status: 'sent',
          })
        },
      })
      setStatus('ready')
    }).catch(err => {
      if (cancelled) return
      setStatus(`failed to start: ${String(err)}`)
    })

    return () => {
      cancelled = true
      reliability.stop()
      messages.close().catch(() => {})
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
