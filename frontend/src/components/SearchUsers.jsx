import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { userAPI, followAPI } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import { Search, UserPlus, UserMinus, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

export default function SearchUsers() {
  const [searchTerm, setSearchTerm] = useState('')
  const { user: currentUser } = useAuthStore()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['userSearch', searchTerm],
    queryFn: () => userAPI.search(searchTerm),
    enabled: searchTerm.length >= 1,
    staleTime: 30000,
  })

  const followMutation = useMutation({
    mutationFn: (userId) => followAPI.follow(userId),
    onSuccess: () => {
      queryClient.invalidateQueries(['userSearch', searchTerm])
      toast.success('User followed!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to follow')
    },
  })

  const unfollowMutation = useMutation({
    mutationFn: (userId) => followAPI.unfollow(userId),
    onSuccess: () => {
      queryClient.invalidateQueries(['userSearch', searchTerm])
      toast.success('User unfollowed')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to unfollow')
    },
  })

  const handleFollow = (e, userId, isFollowing) => {
    e.preventDefault()
    e.stopPropagation()
    if (isFollowing) {
      unfollowMutation.mutate(userId)
    } else {
      followMutation.mutate(userId)
    }
  }

  const users = data?.data?.users || []

  return (
    <div className="p-4">
      {/* Search Input */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
        <input
          type="text"
          placeholder="Search users..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-gray-800 text-white pl-10 pr-4 py-3 rounded-full focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Results */}
      {isLoading && searchTerm && (
        <div className="flex justify-center p-4">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && searchTerm && users.length === 0 && (
        <p className="text-gray-500 text-center p-4">No users found</p>
      )}

      {users.length > 0 && (
        <div className="space-y-2">
          {users.map((user) => (
            <Link
              key={user.id}
              to={`/profile/${user.username}`}
              className="flex items-center justify-between p-3 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center font-bold text-lg">
                  {user.username?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-white flex items-center gap-1">
                    {user.display_name}
                    {user.verified && (
                      <span className="text-primary">✓</span>
                    )}
                  </p>
                  <p className="text-gray-500">@{user.username}</p>
                  <p className="text-gray-500 text-sm">
                    {user.follower_count} followers
                  </p>
                </div>
              </div>

              {!user.isCurrentUser && currentUser?.username !== user.username && (
                <button
                  onClick={(e) => handleFollow(e, user.id, user.isFollowing)}
                  disabled={followMutation.isPending || unfollowMutation.isPending}
                  className={`px-4 py-2 rounded-full font-semibold text-sm transition-colors ${
                    user.isFollowing
                      ? 'bg-transparent border border-gray-600 text-white hover:border-red-500 hover:text-red-500'
                      : 'bg-white text-black hover:bg-gray-200'
                  }`}
                >
                  {user.isFollowing ? (
                    <span className="flex items-center gap-1">
                      <UserMinus className="w-4 h-4" />
                      Unfollow
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <UserPlus className="w-4 h-4" />
                      Follow
                    </span>
                  )}
                </button>
              )}
            </Link>
          ))}
        </div>
      )}

      {!searchTerm && (
        <p className="text-gray-500 text-center p-4">
          Search for users by username or display name
        </p>
      )}
    </div>
  )
}
