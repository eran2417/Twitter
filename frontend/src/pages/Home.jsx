import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { timelineAPI } from '../api/client'
import { connectSocket, disconnectSocket, getSocket } from '../api/socket'
import { useAuthStore } from '../stores/authStore'
import ComposeTweet from '../components/ComposeTweet'
import TweetCard from '../components/TweetCard'
import { Loader2 } from 'lucide-react'

export default function Home() {
  const queryClient = useQueryClient()
  const { user, token, isAuthenticated } = useAuthStore()
  const [tweets, setTweets] = useState([])
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  
  // Check if token exists in localStorage or in store
  const hasToken = token || localStorage.getItem('token')

  const { data, isLoading, error } = useQuery({
    queryKey: ['timeline', null],
    queryFn: () => timelineAPI.getTimeline({ limit: 5, cursor: null }),
    enabled: !!hasToken, // Enable query if token exists
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  if (error) {
    console.error('Error in Home component:', error)
    console.error('Error details:', error.response?.data || error.message)
  }

  useEffect(() => {
    console.log('=== Home.jsx useEffect triggered ===')
    console.log('data:', data)
    console.log('data?.data:', data?.data)
    console.log('data?.data?.tweets:', data?.data?.tweets)
    console.log('Is array?', Array.isArray(data?.data?.tweets))
    console.log('Array length:', data?.data?.tweets?.length)

    if (data) {
      console.log('Full API Response:', data)
      console.log('Pagination info:', data.pagination)
    }
    if (data?.data?.tweets && Array.isArray(data.data.tweets)) {
      console.log('Setting tweets with', data.data.tweets.length, 'items')
      setTweets(data.data.tweets)
      setCursor(data.pagination?.nextCursor)
      setHasMore(data.pagination?.hasMore || false)
    } else {
      console.warn('Tweets not found or not an array')
    }
  }, [data])

  const loadMore = async () => {
    if (!cursor || isLoadingMore) return
    
    setIsLoadingMore(true)
    try {
      const response = await timelineAPI.getTimeline({ limit: 5, cursor })
      if (response.data?.tweets) {
        setTweets((prevTweets) => [...prevTweets, ...response.data.tweets])
        setCursor(response.pagination?.nextCursor)
        setHasMore(response.pagination?.hasMore || false)
      }
    } catch (err) {
      console.error('Error loading more tweets:', err)
    } finally {
      setIsLoadingMore(false)
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      const socket = connectSocket(token)

      socket.on('tweet-created', (newTweet) => {
        setTweets((prevTweets) => [newTweet, ...prevTweets])
        queryClient.invalidateQueries({ queryKey: ['timeline'] })
      })

      return () => {
        socket.off('tweet-created')
        disconnectSocket()
      }
    }
  }, [queryClient])

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500">Error loading timeline</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-dark/80 backdrop-blur-sm border-b border-gray-800 p-4">
        <h1 className="text-xl font-bold">Home</h1>
      </div>

      {/* Compose Tweet */}
      <ComposeTweet />

      {/* Timeline */}
      <div>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : tweets?.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No tweets yet. Follow some users or create your first tweet!</p>
          </div>
        ) : (
          <>
            {tweets?.map((tweet) => (
              <TweetCard key={tweet.id} tweet={tweet} />
            ))}
            
            {/* Load More Button */}
            {hasMore && (
              <div className="p-4 text-center border-t border-gray-800">
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="px-4 py-2 text-primary hover:bg-gray-900/50 rounded-full disabled:opacity-50"
                >
                  {isLoadingMore ? (
                    <Loader2 className="w-4 h-4 inline-block animate-spin" />
                  ) : (
                    'Load more tweets'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
