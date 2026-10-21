import { useEffect, useState } from 'react'

// Shared by the Fertilizer/Water/Satellite/Export pages so each can show a
// real "you're offline, showing last loaded data" state instead of silently
// retrying forever or pretending cached data is live.
export function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
