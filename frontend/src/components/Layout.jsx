import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Trending from './Trending'

export default function Layout() {
  return (
    <div className="min-h-screen bg-darker">
      <div className="max-w-7xl mx-auto flex">
        {/* Left Sidebar */}
        <div className="w-20 lg:w-64 sticky top-0 h-screen">
          <Sidebar />
        </div>

        {/* Main Content */}
        <div className="flex-1 border-x border-gray-800 min-h-screen">
          <Outlet />
        </div>

        {/* Right Sidebar - Trending */}
        <div className="hidden xl:block w-80 sticky top-0 h-screen overflow-y-auto">
          <Trending />
        </div>
      </div>
    </div>
  )
}
