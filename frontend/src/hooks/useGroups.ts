import { useEffect, useState } from 'react'
import { useMessenger } from '../contexts/MessengerContext'
import type { Group } from '../lib/types'

export function useGroups() {
  const { handles } = useMessenger()
  const [groups, setGroups] = useState<Group[]>([])

  useEffect(() => {
    if (!handles) { setGroups([]); return }
    let cancelled = false
    const refresh = () => {
      handles.groups.list().then(list => {
        if (!cancelled) setGroups(list)
      })
    }
    refresh()
    const off = handles.groups.subscribe(refresh)
    return () => { cancelled = true; off() }
  }, [handles])

  return groups
}
