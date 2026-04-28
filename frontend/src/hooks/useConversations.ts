import { useEffect, useState } from 'react'
import { useMessenger } from '../contexts/MessengerContext'
import type { ConversationSummary } from '../lib/messages-store'

export function useConversations() {
  const { handles } = useMessenger()
  const [list, setList] = useState<ConversationSummary[]>([])

  useEffect(() => {
    if (!handles) { setList([]); return }
    let cancelled = false
    const refresh = () => {
      handles.messages.listConversations().then(l => {
        if (!cancelled) setList(l)
      })
    }
    refresh()
    const off = handles.messages.subscribe(refresh)
    return () => { cancelled = true; off() }
  }, [handles])

  return list
}
