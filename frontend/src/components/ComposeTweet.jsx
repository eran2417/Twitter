import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tweetAPI } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'
import { Send } from 'lucide-react'

export default function ComposeTweet() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const { register, handleSubmit, reset, watch } = useForm()

  const content = watch('content', '')
  const charCount = content.length

  const createTweetMutation = useMutation({
    mutationFn: (data) => tweetAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['timeline'])
      reset()
      toast.success('Tweet posted!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to post tweet')
    },
  })

  const onSubmit = (data) => {
    if (!data.content.trim()) {
      toast.error('Tweet cannot be empty')
      return
    }

    // Extract hashtags
    const hashtags = data.content.match(/#[\w]+/g)?.map(tag => tag.slice(1)) || []

    createTweetMutation.mutate({
      content: data.content,
      hashtags,
    })
  }

  return (
    <div className="border-b border-gray-800 p-4">
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center font-bold">
            {user?.username?.[0]?.toUpperCase()}
          </div>
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex-1">
          <textarea
            {...register('content')}
            placeholder="What's happening?"
            className="w-full bg-transparent text-white text-xl placeholder-gray-500 focus:outline-none resize-none"
            rows={3}
            maxLength={280}
          />

          <div className="flex items-center justify-between mt-3">
            <span className={`text-sm ${charCount > 260 ? 'text-red-500' : 'text-gray-500'}`}>
              {charCount} / 280
            </span>

            <button
              type="submit"
              disabled={!content.trim() || charCount > 280 || createTweetMutation.isPending}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              {createTweetMutation.isPending ? 'Posting...' : 'Tweet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
