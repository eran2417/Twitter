import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Home from './pages/Home'
import Profile from './pages/Profile'
import TweetDetail from './pages/TweetDetail'
import Search from './pages/Search'
import Followers from './pages/Followers'
import { Loader2 } from 'lucide-react'

function App() {
  const { isAuthenticated, isLoading } = useAuthStore()

  // Show loading spinner while verifying token
  if (isLoading) {
    return (
      <div className="min-h-screen bg-darker flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" />} />
      <Route path="/register" element={!isAuthenticated ? <Register /> : <Navigate to="/" />} />
      
      <Route element={<Layout />}>
        <Route path="/" element={isAuthenticated ? <Home /> : <Navigate to="/login" />} />
        <Route path="/search" element={isAuthenticated ? <Search /> : <Navigate to="/login" />} />
        <Route path="/profile/:username" element={isAuthenticated ? <Profile /> : <Navigate to="/login" />} />
        <Route path="/profile/:username/followers" element={isAuthenticated ? <Followers /> : <Navigate to="/login" />} />
        <Route path="/tweet/:id" element={isAuthenticated ? <TweetDetail /> : <Navigate to="/login" />} />
      </Route>
    </Routes>
  )
}

export default App
