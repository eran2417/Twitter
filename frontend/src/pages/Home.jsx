import { useEffect, useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { timelineAPI } from '../api/client'
import { connectSSE, disconnectSSE } from '../api/sse'
import { useAuthStore } from '../stores/authStore'
import ComposeTweet from '../components/ComposeTweet'
import TweetCard from '../components/TweetCard'
import { Loader2 } from 'lucide-react'

export default function Home() {
  const { user, isAuthenticated } = useAuthStore()
  const queryClient = useQueryClient()
  const [sseConnected, setSseConnected] = useState(false)

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['timeline', user?.id ?? null],
    queryFn: ({ pageParam }) => timelineAPI.getTimeline(pageParam),
    getNextPageParam: (lastPage) => lastPage?.data?.pagination?.nextCursor ?? undefined,
    enabled: isAuthenticated,
    staleTime: Infinity,
    refetchInterval: sseConnected ? false : 30000,
  })

  const tweets = data?.pages.flatMap(p => p.data?.data?.tweets ?? []) ?? []

  useEffect(() => {
    if (isAuthenticated) {
      connectSSE({
        onTweet: (newTweet) => {
          queryClient.setQueryData(['timeline', user?.id ?? null], (old) => {
            if (!old) return old
            const firstPage = old.pages[0]
            return {
              ...old,
              pages: [
                {
                  ...firstPage,
                  data: {
                    ...firstPage.data,
                    data: {
                      ...firstPage.data?.data,
                      tweets: [newTweet, ...(firstPage.data?.data?.tweets ?? [])]
                    }
                  }
                },
                ...old.pages.slice(1)
              ]
            }
          })
        },
        onConnected: () => setSseConnected(true),
        onDisconnected: () => setSseConnected(false),
      })

      return () => {
        disconnectSSE()
      }
    }
  }, [isAuthenticated])

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
        ) : tweets.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No chirps yet. Follow some users or create your first chirp!</p>
          </div>
        ) : (
          <>
            {tweets.map((tweet) => (
              <TweetCard key={tweet.id} tweet={tweet} />
            ))}

            {hasNextPage && (
              <div className="p-4 text-center border-t border-gray-800">
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="px-4 py-2 text-primary hover:bg-gray-900/50 rounded-full disabled:opacity-50"
                >
                  {isFetchingNextPage ? (
                    <Loader2 className="w-4 h-4 inline-block animate-spin" />
                  ) : (
                    'Load more chirps'
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
