import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authAPI } from '../api/client'
import toast from 'react-hot-toast'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (credentials) => {
        set({ isLoading: true })
        try {
          const response = await authAPI.login(credentials)
          const { token, user } = response.data
          
          localStorage.setItem('token', token)
          set({ user, token, isAuthenticated: true, isLoading: false })
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
          const { token, user } = response.data
          
          localStorage.setItem('token', token)
          set({ user, token, isAuthenticated: true, isLoading: false })
          toast.success('Registration successful!')
          return true
        } catch (error) {
          set({ isLoading: false })
          toast.error(error.response?.data?.error || 'Registration failed')
          return false
        }
      },

      logout: () => {
        localStorage.removeItem('token')
        set({ user: null, token: null, isAuthenticated: false })
        toast.success('Logged out successfully')
      },

      verifyToken: async () => {
        const token = localStorage.getItem('token')
        if (!token) {
          set({ isAuthenticated: false, isLoading: false })
          return false
        }

        set({ isLoading: true })
        try {
          const response = await authAPI.verify()
          set({ user: response.data.user, token, isAuthenticated: true, isLoading: false })
          return true
        } catch (error) {
          localStorage.removeItem('token')
          set({ user: null, token: null, isAuthenticated: false, isLoading: false })
          return false
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        token: state.token, 
        user: state.user,
        isAuthenticated: state.isAuthenticated 
      }),
    }
  )
)
