import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { tweetAPI } from '../api/client'
import TweetCard from '../components/TweetCard'
import { Loader2, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function TweetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['tweet', id],
    queryFn: () => tweetAPI.getById(id),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-dark/80 backdrop-blur-sm border-b border-gray-800 p-4 flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="hover:bg-gray-800 p-2 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">Tweet</h1>
      </div>

      {/* Tweet */}
      {data?.data && <TweetCard tweet={data.data} />}
    </div>
  )
}
