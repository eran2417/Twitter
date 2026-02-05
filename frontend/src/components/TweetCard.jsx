import { formatDistanceToNow } from 'date-fns'
import { Heart, MessageCircle, Repeat2, Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tweetAPI } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'

export default function TweetCard({ tweet }) {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  const likeMutation = useMutation({
    mutationFn: () => tweetAPI.like(tweet.id),
    onSuccess: () => {
      queryClient.invalidateQueries(['timeline'])
      queryClient.invalidateQueries(['tweet', tweet.id])
      toast.success('Tweet liked')
    },
  })

  const unlikeMutation = useMutation({
    mutationFn: () => tweetAPI.unlike(tweet.id),
    onSuccess: () => {
      queryClient.invalidateQueries(['timeline'])
      queryClient.invalidateQueries(['tweet', tweet.id])
      toast.success('Tweet unliked')
    },
  })

  const retweetMutation = useMutation({
    mutationFn: () => tweetAPI.retweet(tweet.id),
    onSuccess: () => {
      queryClient.invalidateQueries(['timeline'])
      queryClient.invalidateQueries(['tweet', tweet.id])
      toast.success('Retweeted!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to retweet')
    },
  })

  const unretweetMutation = useMutation({
    mutationFn: () => tweetAPI.unretweet(tweet.id),
    onSuccess: () => {
      queryClient.invalidateQueries(['timeline'])
      queryClient.invalidateQueries(['tweet', tweet.id])
      toast.success('Retweet removed')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => tweetAPI.delete(tweet.id),
    onSuccess: () => {
      queryClient.invalidateQueries(['timeline'])
      toast.success('Tweet deleted')
    },
  })

  const handleLike = (e) => {
    e.stopPropagation()
    if (tweet.isLiked) {
      unlikeMutation.mutate()
    } else {
      likeMutation.mutate()
    }
  }

  const handleDelete = (e) => {
    e.stopPropagation()
    if (window.confirm('Are you sure you want to delete this tweet?')) {
      deleteMutation.mutate()
    }
  }

  const handleRetweet = (e) => {
    e.stopPropagation()
    if (tweet.isRetweeted) {
      unretweetMutation.mutate()
    } else {
      retweetMutation.mutate()
    }
  }

  return (
    <div className="card p-4 cursor-pointer">
      <Link to={`/tweet/${tweet.id}`}>
        <div className="flex gap-3">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center font-bold">
              {tweet.username?.[0]?.toUpperCase()}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 flex-wrap">
              <Link 
                to={`/profile/${tweet.username}`}
                className="font-semibold hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {tweet.display_name}
              </Link>
              <span className="text-gray-500">@{tweet.username}</span>
              <span className="text-gray-500">·</span>
              <span className="text-gray-500 text-sm">
                {formatDistanceToNow(new Date(tweet.created_at), { addSuffix: true })}
              </span>
            </div>

            {/* Tweet content */}
            <p className="mt-2 text-white break-words">{tweet.content}</p>

            {/* Hashtags */}
            {tweet.hashtags && tweet.hashtags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {tweet.hashtags.map((tag) => (
                  <span key={tag} className="text-primary hover:underline">
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="mt-3 flex items-center gap-8 text-gray-500">
              <button className="flex items-center gap-2 hover:text-primary transition-colors group">
                <MessageCircle className="w-5 h-5 group-hover:bg-primary/10 rounded-full p-1 transition-colors" />
                <span className="text-sm">{tweet.reply_count || 0}</span>
              </button>

              <button 
                onClick={handleRetweet}
                className={`flex items-center gap-2 transition-colors group ${
                  tweet.isRetweeted ? 'text-green-500' : 'hover:text-green-500'
                }`}
              >
                <Repeat2 className={`w-5 h-5 group-hover:bg-green-500/10 rounded-full p-1 transition-colors ${
                  tweet.isRetweeted ? 'text-green-500' : ''
                }`} />
                <span className="text-sm">{tweet.retweet_count || 0}</span>
              </button>

              <button 
                onClick={handleLike}
                className={`flex items-center gap-2 transition-colors group ${
                  tweet.isLiked ? 'text-red-500' : 'hover:text-red-500'
                }`}
              >
                <Heart 
                  className={`w-5 h-5 group-hover:bg-red-500/10 rounded-full p-1 transition-colors ${
                    tweet.isLiked ? 'fill-current' : ''
                  }`}
                />
                <span className="text-sm">{tweet.like_count || 0}</span>
              </button>

              {user?.id === tweet.user_id && (
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-2 hover:text-red-500 transition-colors group ml-auto"
                >
                  <Trash2 className="w-5 h-5 group-hover:bg-red-500/10 rounded-full p-1 transition-colors" />
                </button>
              )}
            </div>
          </div>
        </div>
      </Link>
    </div>
  )
}
