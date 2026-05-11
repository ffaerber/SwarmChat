import { useState, useEffect, useMemo, useCallback } from 'react'
import { Bee } from '@ethersphere/bee-js'
import type { PostageBatch, Topology } from '@ethersphere/bee-js'
import { BEE_API_URL, BEE_GATEWAY_URL } from '../config/contracts'

export function useBee() {
  const [beeUrl, setBeeUrl] = useState(() => localStorage.getItem('bee-api-url') || BEE_API_URL)
  const localBee = useMemo(() => new Bee(beeUrl), [beeUrl])
  const gatewayBee = useMemo(() => new Bee(BEE_GATEWAY_URL), [])

  const updateBeeUrl = useCallback((url: string) => {
    localStorage.setItem('bee-api-url', url)
    setBeeUrl(url)
  }, [])

  const [batchId, setBatchId] = useState<string | null>(null)
  const [allBatches, setAllBatches] = useState<PostageBatch[]>([])
  const [topology, setTopology] = useState<Topology | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [nodeAddresses, setNodeAddresses] = useState<{ pssPublicKey?: string; overlay?: string }>({})

  useEffect(() => {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject('timeout'), 3000))
    Promise.race([localBee.isConnected(), timeout])
      .then(setIsConnected)
      .catch(() => setIsConnected(false))
  }, [localBee])

  useEffect(() => {
    if (!isConnected) return
    localBee.getTopology()
      .then(setTopology)
      .catch(() => {})
  }, [localBee, isConnected])

  useEffect(() => {
    if (!isConnected) return
    localBee.getAllPostageBatch()
      .then(batches => {
        setAllBatches(batches)
        const usable = batches.find(b => b.usable)
        if (usable) setBatchId(usable.batchID.toString())
      })
      .catch(() => {})
  }, [localBee, isConnected])

  // Pull PSS public key + Swarm overlay from local node so we can register on-chain.
  useEffect(() => {
    if (!isConnected) return
    localBee.getNodeAddresses()
      .then(addr => {
        const pss = (addr as any).pssPublicKey
        const ov = (addr as any).overlay
        setNodeAddresses({
          // Contract requires 33-byte compressed secp256k1 key
          pssPublicKey: typeof pss?.toCompressedHex === 'function'
            ? pss.toCompressedHex()
            : typeof pss === 'string' ? pss : undefined,
          overlay: typeof ov?.toHex === 'function'
            ? ov.toHex()
            : typeof ov === 'string' ? ov : undefined,
        })
      })
      .catch(() => {})
  }, [localBee, isConnected])

  const selectBatch = (id: string) => setBatchId(id)

  return {
    reader: isConnected ? localBee : gatewayBee,
    writer: localBee,
    readUrl: isConnected ? beeUrl : BEE_GATEWAY_URL,
    beeUrl,
    updateBeeUrl,
    batchId,
    allBatches,
    topology,
    isConnected,
    peerCount: topology?.connected ?? 0,
    pssPublicKey: nodeAddresses.pssPublicKey,
    swarmOverlay: nodeAddresses.overlay,
    selectBatch,
  }
}
