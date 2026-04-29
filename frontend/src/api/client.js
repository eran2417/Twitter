import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // send httpOnly cookie on every request
})

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't redirect on verify — it's expected to 401 when not logged in
    const isVerify = error.config?.url?.includes('/auth/verify')
    if (error.response?.status === 401 && !isVerify) {
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  verify: () => api.get('/auth/verify'),
}

export const userAPI = {
  getProfile: (username) => api.get(`/users/${username}`),
  updateProfile: (data) => api.patch('/users/me', data),
  getUserTweets: (username, cursor) => api.get(`/users/${username}/tweets${cursor ? `?cursor=${cursor}` : ''}`),
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
  getTimeline: (cursor) => api.get(`/timeline${cursor ? `?cursor=${cursor}` : ''}`),
  getTrending: () => api.get('/timeline/trending/hashtags'),
  searchHashtag: (hashtag, cursor) => api.get(`/timeline/search/hashtag/${hashtag}${cursor ? `?cursor=${cursor}` : ''}`),
}

export const followAPI = {
  follow: (userId) => api.post(`/follows/${userId}`),
  unfollow: (userId) => api.delete(`/follows/${userId}`),
  getFollowers: (userId, params) => api.get(`/follows/${userId}/followers`, { params }),
  getFollowing: (userId, params) => api.get(`/follows/${userId}/following`, { params }),
}

export const searchAPI = {
  searchTweets: (q, params) => api.get('/search/tweets', { params: { q, ...params } }),
  searchUsers: (q, params) => api.get('/search/users', { params: { q, ...params } }),
  getTrending: (params) => api.get('/search/trending', { params }),
  reindexTweets: () => api.post('/search/reindex'),
  reindexUsers: () => api.post('/search/reindex-users'),
}

export default api
