import { useEffect, useState } from 'react'
import { useMessenger } from '../contexts/MessengerContext'
import type { Call } from '../lib/calls'

export function useCall(): Call | null {
  const { handles } = useMessenger()
  const [call, setCall] = useState<Call | null>(null)

  useEffect(() => {
    if (!handles) { setCall(null); return }
    setCall(handles.calls.currentCall ?? null)
    return handles.calls.onChange(c => setCall(c))
  }, [handles])

  return call
}
