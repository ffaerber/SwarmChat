import { useEffect, useState } from 'react'
import { useMessenger } from '../contexts/MessengerContext'
import type { Hex } from '../lib/types'

export function useBlocklist() {
  const { handles } = useMessenger()
  const [blocked, setBlocked] = useState<Hex[]>([])

  useEffect(() => {
    if (!handles) { setBlocked([]); return }
    const refresh = () => setBlocked(handles.blocklist.list())
    refresh()
    return handles.blocklist.subscribe(refresh)
  }, [handles])

  const isBlocked = (wallet: Hex) => !!handles?.blocklist.isBlocked(wallet)
  const block = async (wallet: Hex) => handles?.blocklist.block(wallet)
  const unblock = async (wallet: Hex) => handles?.blocklist.unblock(wallet)

  return { blocked, isBlocked, block, unblock }
}
