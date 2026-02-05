import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  verify: () => api.get('/auth/verify'),
}

export const userAPI = {
  getProfile: (username) => api.get(`/users/${username}`),
  updateProfile: (data) => api.patch('/users/me', data),
  getUserTweets: (username, params) => api.get(`/users/${username}/tweets`, { params }),
  search: (q, params) => api.get('/users/search/query', { params: { q, ...params } }),
}

export const tweetAPI = {
  create: (data) => api.post('/tweets', data),
  getById: (id) => api.get(`/tweets/${id}`),
  like: (id) => api.post(`/tweets/${id}/like`),
  unlike: (id) => api.delete(`/tweets/${id}/like`),
  retweet: (id) => api.post(`/tweets/${id}/retweet`),
  unretweet: (id) => api.delete(`/tweets/${id}/retweet`),
  delete: (id) => api.delete(`/tweets/${id}`),
}

export const timelineAPI = {
  getTimeline: (params) => api.get('/timeline', { params }),
  getTrending: (params) => api.get('/timeline/trending/hashtags', { params }),
  searchHashtag: (hashtag, params) => api.get(`/timeline/search/hashtag/${hashtag}`, { params }),
}

export const followAPI = {
  follow: (userId) => api.post(`/follows/${userId}`),
  unfollow: (userId) => api.delete(`/follows/${userId}`),
  getFollowers: (userId, params) => api.get(`/follows/${userId}/followers`, { params }),
  getFollowing: (userId, params) => api.get(`/follows/${userId}/following`, { params }),
}

export default api
