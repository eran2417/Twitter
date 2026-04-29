import { create } from 'zustand'
import { authAPI } from '../api/client'
import toast from 'react-hot-toast'

export const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,

  login: async (credentials) => {
    set({ isLoading: true })
    try {
      const response = await authAPI.login(credentials)
      const { user } = response.data
      set({ user, isAuthenticated: true, isLoading: false })
      toast.success('Login successful!')
      return true
    } catch (error) {
      set({ isLoading: false })
      toast.error(error.response?.data?.error || 'Login failed')
      return false
    }
  },

  register: async (data) => {
    set({ isLoading: true })
    try {
      const response = await authAPI.register(data)
      const { user } = response.data
      set({ user, isAuthenticated: true, isLoading: false })
      toast.success('Registration successful!')
      return true
    } catch (error) {
      set({ isLoading: false })
      toast.error(error.response?.data?.error || 'Registration failed')
      return false
    }
  },

  logout: async () => {
    try {
      await authAPI.logout()
    } catch (_) {
      // Clear local state even if server call fails
    }
    set({ user: null, isAuthenticated: false })
    toast.success('Logged out successfully')
  },

  verifyToken: async () => {
    try {
      const response = await authAPI.verify()
      set({ user: response.data.user, isAuthenticated: true })
      return true
    } catch (error) {
      set({ user: null, isAuthenticated: false })
      return false
    }
  },
}))
