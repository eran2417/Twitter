import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { userAPI, followAPI } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import TweetCard from '../components/TweetCard'
import { Loader2, Calendar, UserPlus, UserMinus } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export default function Profile() {
  const { username } = useParams()
  const { user: currentUser } = useAuthStore()
  const queryClient = useQueryClient()

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', username],
    queryFn: () => userAPI.getProfile(username),
  })

  const { data: tweets, isLoading: tweetsLoading } = useQuery({
    queryKey: ['userTweets', username],
    queryFn: () => userAPI.getUserTweets(username, { limit: 50 }),
  })

  const followMutation = useMutation({
    mutationFn: () => followAPI.follow(profile.data.id),
    onSuccess: () => {
      queryClient.invalidateQueries(['profile', username])
      toast.success('User followed')
    },
  })

  const unfollowMutation = useMutation({
    mutationFn: () => followAPI.unfollow(profile.data.id),
    onSuccess: () => {
      queryClient.invalidateQueries(['profile', username])
      toast.success('User unfollowed')
    },
  })

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  const isOwnProfile = currentUser?.username === username
  const user = profile?.data

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-dark/80 backdrop-blur-sm border-b border-gray-800 p-4">
        <h1 className="text-xl font-bold">{user?.display_name}</h1>
        <p className="text-sm text-gray-500">{user?.tweet_count} Tweets</p>
      </div>

      {/* Profile Info */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex justify-between items-start mb-4">
          <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center font-bold text-3xl">
            {user?.username?.[0]?.toUpperCase()}
          </div>

          {!isOwnProfile && (
            <button
              onClick={() => user?.isFollowing ? unfollowMutation.mutate() : followMutation.mutate()}
              className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-colors ${
                user?.isFollowing 
                  ? 'bg-transparent border border-gray-600 text-white hover:border-red-500 hover:text-red-500' 
                  : 'bg-white text-black hover:bg-gray-200'
              }`}
            >
              {user?.isFollowing ? (
                <>
                  <UserMinus className="w-4 h-4" />
                  Unfollow
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Follow
                </>
              )}
            </button>
          )}
        </div>

        <div>
          <h2 className="text-2xl font-bold">{user?.display_name}</h2>
          <p className="text-gray-500">@{user?.username}</p>
        </div>

        {user?.bio && (
          <p className="mt-3">{user.bio}</p>
        )}

        {user?.location && (
          <p className="mt-2 text-gray-400">📍 {user.location}</p>
        )}

        <div className="flex items-center gap-2 mt-3 text-gray-500">
          <Calendar className="w-4 h-4" />
          <span className="text-sm">
            Joined {format(new Date(user?.created_at), 'MMMM yyyy')}
          </span>
        </div>

        <div className="flex gap-4 mt-3">
          <Link to={`/profile/${username}/followers?tab=following`} className="hover:underline">
            <span className="font-bold text-white">{user?.following_count}</span>
            <span className="text-gray-500 ml-1">Following</span>
          </Link>
          <Link to={`/profile/${username}/followers?tab=followers`} className="hover:underline">
            <span className="font-bold text-white">{user?.follower_count}</span>
            <span className="text-gray-500 ml-1">Followers</span>
          </Link>
        </div>
      </div>

      {/* Tweets */}
      <div>
        {tweetsLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : tweets?.data?.tweets?.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No tweets yet</p>
          </div>
        ) : (
          tweets?.data?.tweets?.map((tweet) => (
            <TweetCard key={tweet.id} tweet={tweet} />
          ))
        )}
      </div>
    </div>
  )
}
