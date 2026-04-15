const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

let eventSource = null

export const connectSSE = (token, { onTweet, onConnected, onDisconnected } = {}) => {
  if (eventSource) {
    eventSource.close()
  }

  eventSource = new EventSource(
    `${API_URL}/api/v1/timeline/stream?token=${encodeURIComponent(token)}`
  )

  eventSource.onopen = () => {
    onConnected?.()
  }

  eventSource.onmessage = (event) => {
    try {
      const tweet = JSON.parse(event.data)
      onTweet?.(tweet)
    } catch (err) {
      console.error('SSE parse error:', err)
    }
  }

  eventSource.onerror = () => {
    console.warn('SSE connection error — will auto-reconnect')
    onDisconnected?.()
  }

  return eventSource
}

export const disconnectSSE = () => {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
}
