import { formatDistanceToNow } from 'date-fns'
import { Heart, MessageCircle, Repeat2, Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tweetAPI } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'

// Update a tweet in-place across all pages of an infinite query cache
function updateTweetInPages(old, tweetId, updater) {
  if (!old) return old
  return {
    ...old,
    pages: old.pages.map(page => ({
      ...page,
      data: {
        ...page.data,
        data: {
          ...page.data?.data,
          tweets: (page.data?.data?.tweets ?? []).map(t =>
            t.id.toString() === tweetId.toString() ? updater(t) : t
          )
        }
      }
    }))
  }
}

export default function TweetCard({ tweet }) {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  const updateAllCaches = (tweetId, updater) => {
    // Update in all timeline caches (keyed by user id)
    queryClient.getQueriesData({ queryKey: ['timeline'] }).forEach(([key]) => {
      queryClient.setQueryData(key, old => updateTweetInPages(old, tweetId, updater))
    })
    // Update in all userTweets caches (keyed by username)
    queryClient.getQueriesData({ queryKey: ['userTweets'] }).forEach(([key]) => {
      queryClient.setQueryData(key, old => updateTweetInPages(old, tweetId, updater))
    })
  }

  const likeMutation = useMutation({
    mutationFn: () => tweetAPI.like(tweet.id),
    onSuccess: () => {
      updateAllCaches(tweet.id, t => ({ ...t, liked: true, like_count: (t.like_count || 0) + 1 }))
      toast.success('Chirp liked')
    },
  })

  const unlikeMutation = useMutation({
    mutationFn: () => tweetAPI.unlike(tweet.id),
    onSuccess: () => {
      updateAllCaches(tweet.id, t => ({ ...t, liked: false, like_count: Math.max((t.like_count || 0) - 1, 0) }))
      toast.success('Chirp unliked')
    },
  })

  const retweetMutation = useMutation({
    mutationFn: () => tweetAPI.retweet(tweet.id),
    onSuccess: (response) => {
      const retweetData = response.data
      // Update retweet count + retweeted flag in-place everywhere
      updateAllCaches(tweet.id, t => ({ ...t, retweeted: true, retweet_count: (t.retweet_count || 0) + 1 }))
      // Prepend the retweet entry to current user's profile
      queryClient.setQueryData(['userTweets', user?.username], old => {
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
                  tweets: [retweetData, ...(firstPage.data?.data?.tweets ?? [])]
                }
              }
            },
            ...old.pages.slice(1)
          ]
        }
      })
      toast.success('Rechirped!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to rechirp')
    },
  })

  const unretweetMutation = useMutation({
    mutationFn: () => tweetAPI.unretweet(tweet.id),
    onSuccess: () => {
      // Update retweet count + retweeted flag in-place everywhere
      updateAllCaches(tweet.id, t => ({ ...t, retweeted: false, retweet_count: Math.max((t.retweet_count || 0) - 1, 0) }))
      // Remove the retweet entry from current user's profile
      queryClient.setQueryData(['userTweets', user?.username], old => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map(page => ({
            ...page,
            data: {
              ...page.data,
              data: {
                ...page.data?.data,
                tweets: (page.data?.data?.tweets ?? []).filter(t =>
                  !(t.is_retweet && t.id.toString() === tweet.id.toString())
                )
              }
            }
          }))
        }
      })
      toast.success('Rechirp removed')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => tweetAPI.delete(tweet.id),
    onSuccess: () => {
      // Remove tweet from all caches
      queryClient.getQueriesData({ queryKey: ['timeline'] }).forEach(([key]) => {
        queryClient.setQueryData(key, old => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map(page => ({
              ...page,
              data: {
                ...page.data,
                data: {
                  ...page.data?.data,
                  tweets: (page.data?.data?.tweets ?? []).filter(t => t.id.toString() !== tweet.id.toString())
                }
              }
            }))
          }
        })
      })
      queryClient.getQueriesData({ queryKey: ['userTweets'] }).forEach(([key]) => {
        queryClient.setQueryData(key, old => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map(page => ({
              ...page,
              data: {
                ...page.data,
                data: {
                  ...page.data?.data,
                  tweets: (page.data?.data?.tweets ?? []).filter(t => t.id.toString() !== tweet.id.toString())
                }
              }
            }))
          }
        })
      })
      toast.success('Chirp deleted')
    },
  })

  const handleLike = (e) => {
    e.stopPropagation()
    if (tweet.liked) {
      unlikeMutation.mutate()
    } else {
      likeMutation.mutate()
    }
  }

  const handleDelete = (e) => {
    e.stopPropagation()
    if (window.confirm('Are you sure you want to delete this chirp?')) {
      deleteMutation.mutate()
    }
  }

  const handleRetweet = (e) => {
    e.stopPropagation()
    if (tweet.retweeted) {
      unretweetMutation.mutate()
    } else {
      retweetMutation.mutate()
    }
  }

  return (
    <div className="card p-4 cursor-pointer">
      {/* Retweet indicator */}
      {tweet.is_retweet && (
        <div className="flex items-center gap-2 text-gray-500 text-sm mb-2 ml-12">
          <Repeat2 className="w-4 h-4" />
          <span>{tweet.retweeted_by_display_name || tweet.retweeted_by_username} Rechirped</span>
        </div>
      )}
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
                  tweet.retweeted ? 'text-green-500' : 'hover:text-green-500'
                }`}
              >
                <Repeat2 className={`w-5 h-5 group-hover:bg-green-500/10 rounded-full p-1 transition-colors ${
                  tweet.retweeted ? 'text-green-500' : ''
                }`} />
                <span className="text-sm">{tweet.retweet_count || 0}</span>
              </button>

              <button
                onClick={handleLike}
                className={`flex items-center gap-2 transition-colors group ${
                  tweet.liked ? 'text-red-500' : 'hover:text-red-500'
                }`}
              >
                <Heart
                  className={`w-5 h-5 group-hover:bg-red-500/10 rounded-full p-1 transition-colors ${
                    tweet.liked ? 'fill-current' : ''
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
