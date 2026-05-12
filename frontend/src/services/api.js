import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const csrf = document.cookie.split('; ').find(row => row.startsWith('csrf='))
  if (csrf) {
    config.headers['X-CSRF-Token'] = csrf.split('=')[1]
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      try {
        await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true })
        return api(originalRequest)
      } catch (_err) {
        window.location.href = '/login'
        return Promise.reject(_err)
      }
    }
    return Promise.reject(error)
  }
)

export default api
