import { Link, useNavigate } from 'react-router-dom'
import { Home, User, LogOut, Twitter, Search } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'

export default function Sidebar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="h-full flex flex-col p-4 bg-dark">
      {/* Logo */}
      <Link to="/" className="mb-8 p-3 hover:bg-gray-800 rounded-full w-fit">
        <Twitter className="w-8 h-8 text-primary" />
      </Link>

      {/* Navigation */}
      <nav className="flex-1 space-y-2">
        <Link 
          to="/" 
          className="flex items-center gap-4 p-3 hover:bg-gray-800 rounded-full transition-colors group"
        >
          <Home className="w-6 h-6" />
          <span className="hidden lg:block text-xl font-medium">Home</span>
        </Link>

        <Link 
          to="/search" 
          className="flex items-center gap-4 p-3 hover:bg-gray-800 rounded-full transition-colors group"
        >
          <Search className="w-6 h-6" />
          <span className="hidden lg:block text-xl font-medium">Search</span>
        </Link>

        <Link 
          to={`/profile/${user?.username}`}
          className="flex items-center gap-4 p-3 hover:bg-gray-800 rounded-full transition-colors group"
        >
          <User className="w-6 h-6" />
          <span className="hidden lg:block text-xl font-medium">Profile</span>
        </Link>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-4 p-3 hover:bg-gray-800 rounded-full transition-colors group text-left"
        >
          <LogOut className="w-6 h-6" />
          <span className="hidden lg:block text-xl font-medium">Logout</span>
        </button>
      </nav>

      {/* User Info */}
      <div className="mt-auto p-3 hover:bg-gray-800 rounded-full cursor-pointer">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center font-bold">
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div className="hidden lg:block flex-1">
            <p className="font-semibold">{user?.displayName}</p>
            <p className="text-sm text-gray-500">@{user?.username}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
