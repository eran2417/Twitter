import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { timelineAPI } from '../api/client'
import ComposeTweet from '../components/ComposeTweet'
import TweetCard from '../components/TweetCard'
import { Loader2 } from 'lucide-react'

export default function Home() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['timeline'],
    queryFn: () => timelineAPI.getTimeline({ limit: 50 }),
    refetchInterval: 30000, // Refresh every 30 seconds
  })

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
        ) : data?.data?.tweets?.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No tweets yet. Follow some users or create your first tweet!</p>
          </div>
        ) : (
          data?.data?.tweets?.map((tweet) => (
            <TweetCard key={tweet.id} tweet={tweet} />
          ))
        )}
      </div>
    </div>
  )
}
