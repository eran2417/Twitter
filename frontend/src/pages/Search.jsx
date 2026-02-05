import SearchUsers from '../components/SearchUsers'

export default function SearchPage() {
  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-dark/80 backdrop-blur-sm border-b border-gray-800 p-4">
        <h1 className="text-xl font-bold">Search</h1>
      </div>

      {/* Search Component */}
      <SearchUsers />
    </div>
  )
}
