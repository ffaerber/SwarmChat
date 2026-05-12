import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  useAccount,
  useDisconnect,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import toast from 'react-hot-toast'
import { CONTACT_REGISTRY_ABI, CONTACT_REGISTRY_ADDRESS } from '../config/contracts'
import { useBeeContext } from '../hooks/BeeContext'
import { useMessenger } from '../contexts/MessengerContext'
import { useBlocklist } from '../hooks/useBlocklist'
import EnsName from './EnsName'
import type { Hex } from '../lib/types'

export default function Settings() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { handles, status: messengerStatus } = useMessenger()
  const { blocked, unblock } = useBlocklist()
  const {
    isConnected: beeConnected,
    peerCount,
    beeUrl,
    pssPublicKey,
    swarmOverlay,
    batchId,
    allBatches,
  } = useBeeContext()

  const { data: profile, refetch: refetchProfile } = useReadContract({
    address: CONTACT_REGISTRY_ADDRESS,
    abi: CONTACT_REGISTRY_ABI,
    functionName: 'getProfile',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })
  const onChainName = Array.isArray(profile) ? (profile[0] as string) : ''
  const onChainPss = Array.isArray(profile) ? (profile[1] as Hex) : undefined
  const onChainOverlay = Array.isArray(profile) ? (profile[2] as Hex) : undefined
  const isActive = Array.isArray(profile) ? (profile[4] as boolean) : false

  const [draftName, setDraftName] = useState('')
  useEffect(() => { setDraftName(onChainName) }, [onChainName])

  const { writeContract, data: txHash, isPending: writing, reset } = useWriteContract()
  const { isSuccess: txDone, isLoading: txConfirming } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (!txDone) return
    refetchProfile()
    reset()
  }, [txDone, refetchProfile, reset])

  const dirty = draftName.trim() !== onChainName && draftName.trim().length > 0
  const canUpdate = dirty && !!pssPublicKey && !!swarmOverlay && !writing && !txConfirming

  const handleUpdateName = () => {
    if (!canUpdate || !pssPublicKey || !swarmOverlay) return
    const pss = pssPublicKey.startsWith('0x') ? pssPublicKey : `0x${pssPublicKey}`
    const overlay = swarmOverlay.startsWith('0x') ? swarmOverlay : `0x${swarmOverlay}`
    writeContract({
      address: CONTACT_REGISTRY_ADDRESS,
      abi: CONTACT_REGISTRY_ABI,
      functionName: 'register',
      args: [draftName.trim(), pss as Hex, overlay as Hex],
    }, {
      onSuccess: () => toast('display name update sent'),
      onError: err => toast.error(`update failed: ${String(err)}`),
    })
  }

  const handleDeactivate = () => {
    if (!isActive) return
    if (!confirm('Deactivate your profile? You will disappear from the directory until you re-register.')) return
    writeContract({
      address: CONTACT_REGISTRY_ADDRESS,
      abi: CONTACT_REGISTRY_ABI,
      functionName: 'deactivate',
    }, {
      onSuccess: () => toast('deactivation sent'),
      onError: err => toast.error(`deactivate failed: ${String(err)}`),
    })
  }

  const stamp = allBatches.find(b => b.batchID.toString() === batchId)
  const stampLabel = stamp ? (stamp.label || stamp.batchID.toString().slice(0, 16) + '…') : '(none)'

  if (!isConnected) {
    return (
      <div className="flex-1 p-8 text-sm text-[#a39690]">
        Connect a wallet to view settings. <Link to="/" className="text-[#ff7a00] underline">Back to chats</Link>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full text-sm">
      <h1 className="text-lg font-semibold text-[#f5ede4] mb-4">Settings</h1>

      <Section title="Profile">
        <Row label="Address">
          <span className="font-mono text-[#f5ede4]">{address}</span>
          <span className="ml-2 text-[#a39690]">(<EnsName address={address!} />)</span>
        </Row>
        <Row label="On-chain status">
          {Array.isArray(profile) ? (
            isActive ? <span className="text-green-500">active</span> : <span className="text-yellow-500">inactive</span>
          ) : <span className="text-[#a39690]">unregistered</span>}
        </Row>
        <Row label="Display name">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={draftName}
              onChange={e => setDraftName(e.target.value.slice(0, 64))}
              placeholder={isActive ? '' : 'register first via the Connect modal'}
              disabled={!isActive}
              className="flex-1 bg-[#0d0a08] border border-[#2e261f] rounded px-2 py-1 text-[#f5ede4] disabled:opacity-50"
            />
            <button
              onClick={handleUpdateName}
              disabled={!canUpdate}
              className="px-3 py-1 bg-[#ff7a00] text-black font-semibold rounded disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer hover:brightness-110"
            >
              {writing || txConfirming ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Row>
        <Row label="PSS pubkey"><Mono v={onChainPss} /></Row>
        <Row label="Swarm overlay"><Mono v={onChainOverlay} /></Row>
        <Row label="Feed owner"><Mono v={handles?.feedIdentity.address} /></Row>
      </Section>

      <Section title="Bee node">
        <Row label="URL"><span className="font-mono text-[#f5ede4]">{beeUrl}</span></Row>
        <Row label="Status">
          {beeConnected ? <span className="text-green-500">connected</span> : <span className="text-red-500">unreachable</span>}
        </Row>
        <Row label="Peers"><span className="text-[#f5ede4]">{peerCount}</span></Row>
        <Row label="Postage batch"><span className="font-mono text-[#f5ede4]">{stampLabel}</span></Row>
        <Row label="Local PSS pubkey"><Mono v={pssPublicKey} /></Row>
        <Row label="Local overlay"><Mono v={swarmOverlay} /></Row>
        <Row label="Messenger"><span className="text-[#a39690]">{messengerStatus}</span></Row>
      </Section>

      <Section title={`Blocklist (${blocked.length})`}>
        {blocked.length === 0 ? (
          <div className="text-[#a39690]">No one blocked. Use the menu in any conversation to block a sender.</div>
        ) : (
          <ul className="divide-y divide-[#2e261f]">
            {blocked.map(addr => (
              <li key={addr} className="flex items-center justify-between py-2">
                <span className="font-mono text-[#f5ede4] text-xs break-all">{addr}</span>
                <button
                  onClick={() => unblock(addr).then(() => toast(`unblocked ${addr.slice(0, 8)}`)).catch(err => toast.error(String(err)))}
                  className="ml-3 px-3 py-1 text-xs border border-[#2e261f] rounded text-[#ff7a00] hover:bg-[#221b16] cursor-pointer"
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Danger zone">
        <Row label="Wallet">
          <button onClick={() => disconnect()} className="px-3 py-1 text-xs border border-[#2e261f] rounded text-[#f5ede4] hover:bg-[#221b16] cursor-pointer">
            Disconnect wallet
          </button>
        </Row>
        <Row label="Profile">
          <button
            onClick={handleDeactivate}
            disabled={!isActive || writing || txConfirming}
            className="px-3 py-1 text-xs border border-red-500/40 rounded text-red-400 hover:bg-red-500/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {writing || txConfirming ? 'Sending…' : 'Deactivate on-chain profile'}
          </button>
        </Row>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 border border-[#2e261f] rounded-lg overflow-hidden">
      <header className="bg-[#18130f] px-4 py-2 text-xs uppercase tracking-wider text-[#a39690]">
        {title}
      </header>
      <div className="p-4 space-y-3 bg-[#0d0a08]">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 items-center">
      <span className="text-[#a39690] text-xs">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  )
}

function Mono({ v }: { v: string | undefined }) {
  if (!v) return <span className="text-[#a39690]">—</span>
  return <span className="font-mono text-[#f5ede4] text-xs break-all">{v}</span>
}
