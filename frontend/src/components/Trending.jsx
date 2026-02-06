import { useQuery } from '@tanstack/react-query'
import { timelineAPI } from '../api/client'
import { Hash } from 'lucide-react'

export default function Trending() {
  const { data: trending, isLoading } = useQuery({
    queryKey: ['trending'],
    queryFn: () => timelineAPI.getTrending({ limit: 10 }),
    refetchInterval: 60000, // Refresh every minute
    select: (res) => res.data, // Extract data from axios response
  })

  // Ensure trending is an array
  const trendingList = Array.isArray(trending) ? trending : []

  return (
    <div className="p-4">
      <div className="bg-dark rounded-2xl p-4">
        <h2 className="text-xl font-bold mb-4">Trending Hashtags</h2>
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-gray-500 text-sm">Loading...</div>
          ) : trendingList.length > 0 ? (
            trendingList.map((item, index) => (
              <div key={item.hashtag} className="hover:bg-gray-800 p-3 rounded-lg cursor-pointer transition-colors">
                <div className="flex items-start gap-3">
                  <Hash className="w-5 h-5 text-primary mt-1" />
                  <div className="flex-1">
                    <p className="font-semibold">#{item.hashtag}</p>
                    <p className="text-sm text-gray-500">
                      {item.tweet_count} {item.tweet_count === 1 ? 'tweet' : 'tweets'}
                    </p>
                  </div>
                  <span className="text-sm text-gray-500">#{index + 1}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-gray-500 text-sm">No trending hashtags yet</div>
          )}
        </div>
      </div>
    </div>
  )
}
