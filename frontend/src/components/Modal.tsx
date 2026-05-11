import { useState } from 'react'
import { useAccount, useBalance, useConnect, useDisconnect, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { CONTACT_REGISTRY_ABI, CONTACT_REGISTRY_ADDRESS } from '../config/contracts'
import { useBeeContext } from '../hooks/BeeContext'
import { useMessenger } from '../contexts/MessengerContext'

interface ModalProps {
  handleClose: () => void
}

export default function Modal({ handleClose }: ModalProps) {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const {
    isConnected: beeConnected, peerCount, allBatches, batchId, selectBatch,
    beeUrl, updateBeeUrl, pssPublicKey, swarmOverlay,
  } = useBeeContext()

  const { data: xdaiBalance } = useBalance({ address })
  const hasXdai = xdaiBalance && xdaiBalance.value > 0n

  const { data: isRegistered } = useReadContract({
    address: CONTACT_REGISTRY_ADDRESS,
    abi: CONTACT_REGISTRY_ABI,
    functionName: 'isRegistered',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const [displayName, setDisplayName] = useState('')
  const { writeContract, data: registerTxHash } = useWriteContract()
  const { isSuccess: registerSuccess } = useWaitForTransactionReceipt({ hash: registerTxHash })
  const messenger = useMessenger()

  const canRegister = !!address && !!pssPublicKey && !!swarmOverlay && displayName.length > 0
  const handleRegister = () => {
    if (!canRegister) return
    const pssBytes = pssPublicKey!.startsWith('0x') ? pssPublicKey! : `0x${pssPublicKey!}`
    const overlayBytes = swarmOverlay!.startsWith('0x') ? swarmOverlay! : `0x${swarmOverlay!}`
    writeContract({
      address: CONTACT_REGISTRY_ADDRESS,
      abi: CONTACT_REGISTRY_ABI,
      functionName: 'register',
      args: [displayName, pssBytes, overlayBytes],
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <div className="bg-[#18130f] border border-[#2e261f] rounded-lg max-w-md w-full mx-4">
        <div className="p-5">
          <h3 className="text-base font-semibold text-[#f5ede4] mb-4">Setup</h3>
          <ul className="text-sm space-y-2">
            <li className="flex items-start gap-2">
              <span className={isConnected ? 'text-green-500' : 'text-red-500'}>{isConnected ? '✓' : 'x'}</span>
              <div className="flex-1">
                {isConnected ? (
                  <span className="text-[#f5ede4]">
                    <span className="font-mono">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                    {' — '}
                    <a onClick={() => disconnect()} className="text-[#ff7a00] underline cursor-pointer">disconnect</a>
                  </span>
                ) : (
                  <span className="text-[#a39690]">
                    No wallet — <a onClick={() => connect({ connector: connectors[0] })} className="text-[#ff7a00] underline cursor-pointer">connect now</a>
                  </span>
                )}
              </div>
            </li>
            <Check ok={!!hasXdai} label="xDAI funded" fail={<>No xDAI — get some at <a target="_blank" href="https://ramp.network/buy/" className="text-[#ff7a00] underline">ramp.network</a></>} />
            <li className="flex items-start gap-2">
              <span className={beeConnected ? 'text-green-500' : 'text-red-500'}>{beeConnected ? '✓' : 'x'}</span>
              <div className="flex-1">
                <span className={beeConnected ? 'text-[#f5ede4]' : 'text-[#a39690]'}>
                  {beeConnected ? 'Bee node running' : <>Install <a target="_blank" href="https://freedombrowser.eth.limo/" className="text-[#ff7a00] underline">Freedom Browser</a> or set URL</>}
                </span>
                <input
                  type="text"
                  value={beeUrl}
                  onChange={e => updateBeeUrl(e.target.value)}
                  placeholder="http://localhost:1633"
                  className="mt-1 w-full bg-[#0d0a08] border border-[#2e261f] rounded text-sm text-[#f5ede4] p-1"
                />
              </div>
            </li>
            <Check ok={peerCount > 0} label={`Swarm peers: ${peerCount}`} fail="No peers connected" />
            <Check ok={!!pssPublicKey && !!swarmOverlay} label="PSS identity ready" fail="Bee node PSS identity unavailable" />

            <li className="flex items-start gap-2">
              {allBatches.length > 0 ? (
                <>
                  <span className={batchId ? 'text-green-500' : 'text-yellow-500'}>{batchId ? '✓' : '!'}</span>
                  <div className="flex-1">
                    <select
                      value={batchId || ''}
                      onChange={e => selectBatch(e.target.value)}
                      className="w-full bg-[#0d0a08] border border-[#2e261f] rounded text-sm text-[#f5ede4] p-1"
                    >
                      <option value="">select stamp</option>
                      {allBatches.filter(b => b.usable).map(b => (
                        <option key={b.batchID.toString()} value={b.batchID.toString()}>
                          {b.label || b.batchID.toString().slice(0, 16) + '...'}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-red-500">x</span>
                  <span className="text-[#a39690]">No postage stamps — create one in your Bee node</span>
                </>
              )}
            </li>
          </ul>

          {isConnected && !isRegistered && !registerSuccess && (
            <div className="mt-5 pt-4 border-t border-[#2e261f]">
              <label className="block text-xs text-[#a39690] mb-1">Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value.slice(0, 64))}
                placeholder="e.g. alice"
                className="w-full bg-[#0d0a08] border border-[#2e261f] rounded text-sm text-[#f5ede4] p-2 mb-2"
              />
              <button
                disabled={!canRegister}
                onClick={handleRegister}
                className="w-full py-1.5 bg-[#ff7a00] text-black text-sm font-semibold rounded disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer hover:brightness-110"
              >
                Register on-chain
              </button>
            </div>
          )}
          {(isRegistered || registerSuccess) && (
            <div className="mt-5 pt-4 border-t border-[#2e261f] space-y-2">
              <div className="text-xs text-[#ff7a00]">+ Registered in ContactRegistry</div>
              {!messenger.handles && (
                <button
                  onClick={() => messenger.deriveAndStart().catch(err => console.error(err))}
                  disabled={!isConnected}
                  className="w-full py-1.5 bg-[#ff7a00] text-black text-sm font-semibold rounded disabled:opacity-40 cursor-pointer hover:brightness-110"
                >
                  Activate messaging (sign once)
                </button>
              )}
              {messenger.handles && (
                <div className="text-xs text-[#ff7a00]">+ Messaging ready</div>
              )}
              <div className="text-[10px] text-[#a39690]">{messenger.status}</div>
            </div>
          )}
        </div>
        <div className="border-t border-[#2e261f] px-5 py-3 flex justify-end">
          <button onClick={handleClose} className="px-4 py-1.5 bg-[#ff7a00] text-black text-sm font-semibold rounded hover:brightness-110 cursor-pointer">
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

function Check({ ok, label, fail }: { ok: boolean, label: string, fail: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className={ok ? 'text-green-500' : 'text-red-500'}>{ok ? '✓' : 'x'}</span>
      <span className={ok ? 'text-[#f5ede4]' : 'text-[#a39690]'}>{ok ? label : fail}</span>
    </li>
  )
}
