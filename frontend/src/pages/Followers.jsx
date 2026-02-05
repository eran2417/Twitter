import { useParams, useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { followAPI, userAPI } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import { Loader2, UserPlus, UserMinus, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Followers() {
  const { username } = useParams()
  const [searchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'followers'
  const { user: currentUser } = useAuthStore()
  const queryClient = useQueryClient()

  // Get user profile to get their ID
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', username],
    queryFn: () => userAPI.getProfile(username),
  })

  const userId = profile?.data?.id

  // Get followers or following based on tab
  const { data, isLoading } = useQuery({
    queryKey: [tab, userId],
    queryFn: () => tab === 'followers' 
      ? followAPI.getFollowers(userId, { limit: 50 })
      : followAPI.getFollowing(userId, { limit: 50 }),
    enabled: !!userId,
  })

  const followMutation = useMutation({
    mutationFn: (id) => followAPI.follow(id),
    onSuccess: () => {
      queryClient.invalidateQueries([tab, userId])
      queryClient.invalidateQueries(['profile', username])
      toast.success('User followed!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to follow')
    },
  })

  const unfollowMutation = useMutation({
    mutationFn: (id) => followAPI.unfollow(id),
    onSuccess: () => {
      queryClient.invalidateQueries([tab, userId])
      queryClient.invalidateQueries(['profile', username])
      toast.success('User unfollowed')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to unfollow')
    },
  })

  const handleFollow = (e, user) => {
    e.preventDefault()
    e.stopPropagation()
    if (user.isFollowing) {
      unfollowMutation.mutate(user.id)
    } else {
      followMutation.mutate(user.id)
    }
  }

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  const users = tab === 'followers' ? data?.data?.followers : data?.data?.following

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-dark/80 backdrop-blur-sm border-b border-gray-800 p-4">
        <div className="flex items-center gap-4">
          <Link to={`/profile/${username}`} className="hover:bg-gray-800 p-2 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{profile?.data?.display_name}</h1>
            <p className="text-sm text-gray-500">@{username}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        <Link
          to={`/profile/${username}/followers?tab=followers`}
          className={`flex-1 text-center py-4 hover:bg-gray-800 transition-colors ${
            tab === 'followers' ? 'border-b-2 border-primary font-bold' : 'text-gray-500'
          }`}
        >
          Followers
        </Link>
        <Link
          to={`/profile/${username}/followers?tab=following`}
          className={`flex-1 text-center py-4 hover:bg-gray-800 transition-colors ${
            tab === 'following' ? 'border-b-2 border-primary font-bold' : 'text-gray-500'
          }`}
        >
          Following
        </Link>
      </div>

      {/* User List */}
      <div>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : users?.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>{tab === 'followers' ? 'No followers yet' : 'Not following anyone yet'}</p>
          </div>
        ) : (
          users?.map((user) => (
            <Link
              key={user.id}
              to={`/profile/${user.username}`}
              className="flex items-center justify-between p-4 hover:bg-gray-800/50 transition-colors border-b border-gray-800"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center font-bold text-lg">
                  {user.username?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-white flex items-center gap-1">
                    {user.display_name}
                    {user.verified && <span className="text-primary">✓</span>}
                  </p>
                  <p className="text-gray-500">@{user.username}</p>
                  <p className="text-gray-500 text-sm">
                    {user.follower_count} followers · {user.following_count} following
                  </p>
                </div>
              </div>

              {currentUser?.username !== user.username && (
                <button
                  onClick={(e) => handleFollow(e, user)}
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
          ))
        )}
      </div>
    </div>
  )
}
