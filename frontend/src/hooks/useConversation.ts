import { useEffect, useState } from 'react'
import { useMessenger } from '../contexts/MessengerContext'
import type { ChatMessage } from '../lib/messages-store'
import type { Hex } from '../lib/types'

export function useConversation(peer: Hex | undefined) {
  const { handles, ready } = useMessenger()
  const [messages, setMessages] = useState<ChatMessage[]>([])

  useEffect(() => {
    if (!handles || !peer) { setMessages([]); return }
    let cancelled = false
    const refresh = () => {
      handles.messages.listForPeer(peer).then(list => {
        if (!cancelled) setMessages(list)
      })
    }
    refresh()
    const off = handles.messages.subscribe(refresh)
    return () => { cancelled = true; off() }
  }, [handles, peer])

  const send = async (text: string) => {
    if (!handles || !peer) throw new Error('messenger not ready')
    if (!text.trim()) return
    await handles.send(peer, text)
  }

  return { messages, send, ready }
}
