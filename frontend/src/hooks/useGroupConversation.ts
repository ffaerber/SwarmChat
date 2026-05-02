import { useEffect, useState } from 'react'
import { useMessenger } from '../contexts/MessengerContext'
import type { ChatMessage } from '../lib/messages-store'
import type { Group, Hex } from '../lib/types'

export function useGroupConversation(groupId: Hex | undefined) {
  const { handles, ready } = useMessenger()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [group, setGroup] = useState<Group | null>(null)

  useEffect(() => {
    if (!handles || !groupId) { setMessages([]); setGroup(null); return }
    let cancelled = false
    const refreshMsgs = () => {
      handles.messages.listForGroup(groupId).then(list => {
        if (!cancelled) setMessages(list)
      })
    }
    const refreshGroup = () => {
      handles.groups.get(groupId).then(g => {
        if (!cancelled) setGroup(g)
      })
    }
    refreshMsgs()
    refreshGroup()
    const offMsgs = handles.messages.subscribe(refreshMsgs)
    const offGroup = handles.groups.subscribe(refreshGroup)
    return () => { cancelled = true; offMsgs(); offGroup() }
  }, [handles, groupId])

  const send = async (text: string) => {
    if (!handles || !groupId) throw new Error('messenger not ready')
    if (!text.trim()) return
    await handles.sendToGroup(groupId, text)
  }

  return { messages, group, send, ready }
}
