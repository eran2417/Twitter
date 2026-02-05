import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { searchAPI, followAPI, tweetAPI } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import TweetCard from '../components/TweetCard'

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { user: currentUser, isAuthenticated } = useAuthStore()
  
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'tweets')
  const [sortBy, setSortBy] = useState('relevance')
  
  // Update URL when search changes
  useEffect(() => {
    if (query) {
      setSearchParams({ q: query, tab: activeTab })
    }
  }, [query, activeTab])
  
  // Search tweets query
  const { 
    data: tweetsData, 
    isLoading: tweetsLoading,
    refetch: refetchTweets
  } = useQuery({
    queryKey: ['search', 'tweets', query, sortBy],
    queryFn: () => searchAPI.searchTweets(query, { sort: sortBy, limit: 30 }),
    enabled: !!query && activeTab === 'tweets',
    select: (res) => res.data
  })
  
  // Search users query
  const { 
    data: usersData, 
    isLoading: usersLoading,
    refetch: refetchUsers
  } = useQuery({
    queryKey: ['search', 'users', query],
    queryFn: () => searchAPI.searchUsers(query, { limit: 20 }),
    enabled: !!query && activeTab === 'users',
    select: (res) => res.data
  })
  
  // Trending hashtags
  const { data: trendingData } = useQuery({
    queryKey: ['trending'],
    queryFn: () => searchAPI.getTrending({ limit: 10 }),
    select: (res) => res.data,
    staleTime: 60000 // 1 minute
  })
  
  // Follow mutation
  const followMutation = useMutation({
    mutationFn: (userId) => followAPI.follow(userId),
    onSuccess: () => {
      queryClient.invalidateQueries(['search', 'users'])
    }
  })
  
  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: (userId) => followAPI.unfollow(userId),
    onSuccess: () => {
      queryClient.invalidateQueries(['search', 'users'])
    }
  })
  
  const handleSearch = (e) => {
    e.preventDefault()
    if (query.trim()) {
      if (activeTab === 'tweets') {
        refetchTweets()
      } else {
        refetchUsers()
      }
    }
  }
  
  const handleHashtagClick = (hashtag) => {
    setQuery(`#${hashtag}`)
    setActiveTab('tweets')
  }
  
  const handleFollowToggle = (user) => {
    if (user.isFollowing) {
      unfollowMutation.mutate(user.id)
    } else {
      followMutation.mutate(user.id)
    }
  }
  
  return (
    <div className="min-h-screen">
      {/* Header with Search */}
      <div className="sticky top-0 z-10 bg-dark/80 backdrop-blur-sm border-b border-gray-800">
        <div className="p-4">
          <form onSubmit={handleSearch}>
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tweets, hashtags, or users..."
                className="w-full bg-gray-800 rounded-full py-3 px-12 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <svg
                className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </form>
        </div>
        
        {/* Tabs */}
        <div className="flex border-b border-gray-800">
          <button
            onClick={() => setActiveTab('tweets')}
            className={`flex-1 py-4 text-center font-medium transition-colors relative ${
              activeTab === 'tweets' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Tweets
            {activeTab === 'tweets' && (
              <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-16 h-1 bg-primary rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 py-4 text-center font-medium transition-colors relative ${
              activeTab === 'users' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Users
            {activeTab === 'users' && (
              <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-16 h-1 bg-primary rounded-full" />
            )}
          </button>
        </div>
      </div>
      
      {/* Content */}
      <div className="p-4">
        {/* No query - show trending */}
        {!query && (
          <div>
            <h2 className="text-xl font-bold mb-4">Trending Hashtags</h2>
            {trendingData?.hashtags?.length > 0 ? (
              <div className="space-y-3">
                {trendingData.hashtags.map((item, index) => (
                  <button
                    key={item.hashtag}
                    onClick={() => handleHashtagClick(item.hashtag)}
                    className="w-full text-left p-3 hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-gray-500 text-sm">#{index + 1} Trending</p>
                        <p className="font-bold text-lg">#{item.hashtag}</p>
                        <p className="text-gray-500 text-sm">{item.count} tweets</p>
                      </div>
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No trending hashtags yet. Start tweeting!</p>
            )}
          </div>
        )}
        
        {/* Tweet Results */}
        {query && activeTab === 'tweets' && (
          <div>
            {/* Sort options */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-gray-500">
                {tweetsData?.total || 0} results for "{query}"
              </p>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-gray-800 text-white rounded-lg px-3 py-1 text-sm focus:outline-none"
              >
                <option value="relevance">Most relevant</option>
                <option value="recent">Most recent</option>
              </select>
            </div>
            
            {tweetsLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
              </div>
            ) : tweetsData?.tweets?.length > 0 ? (
              <div className="space-y-0 divide-y divide-gray-800">
                {tweetsData.tweets.map((tweet) => (
                  <TweetCard key={tweet.id} tweet={tweet} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">No tweets found for "{query}"</p>
                <p className="text-gray-600 text-sm mt-2">Try different keywords or check your spelling</p>
              </div>
            )}
          </div>
        )}
        
        {/* User Results */}
        {query && activeTab === 'users' && (
          <div>
            <p className="text-gray-500 mb-4">
              {usersData?.total || 0} users found
            </p>
            
            {usersLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
              </div>
            ) : usersData?.users?.length > 0 ? (
              <div className="space-y-2">
                {usersData.users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    <Link to={`/profile/${user.username}`} className="flex items-center gap-3 flex-1">
                      <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center text-xl font-bold">
                        {user.display_name?.[0]?.toUpperCase() || user.username[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold hover:underline">{user.display_name || user.username}</p>
                        <p className="text-gray-500">@{user.username}</p>
                        {user.bio && <p className="text-gray-400 text-sm mt-1 line-clamp-1">{user.bio}</p>}
                        <p className="text-gray-500 text-sm mt-1">
                          {user.followers_count} followers
                        </p>
                      </div>
                    </Link>
                    {isAuthenticated && !user.isCurrentUser && (
                      <button
                        onClick={() => handleFollowToggle(user)}
                        disabled={followMutation.isPending || unfollowMutation.isPending}
                        className={`px-4 py-2 rounded-full font-bold transition-colors ${
                          user.isFollowing
                            ? 'bg-transparent border border-gray-600 hover:border-red-500 hover:text-red-500'
                            : 'bg-white text-black hover:bg-gray-200'
                        }`}
                      >
                        {user.isFollowing ? 'Following' : 'Follow'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">No users found for "{query}"</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
