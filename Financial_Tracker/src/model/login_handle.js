import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { API_URL } from '../config.js'

export function useLogin() {
  const router = useRouter()
  const username = ref('')
  const password = ref('')
  const error = ref('')
  const success = ref('')
  const loading = ref(false)

  async function login() {
    error.value = ''
    success.value = ''

    if (!username.value || !password.value) {
      error.value = 'Please enter your username and password.'
      return
    }

    loading.value = true

    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.value,
          password: password.value
        })
      })

      const data = await response.json()

      if (!response.ok) {
        error.value = data.message || 'Login failed.'
        return
      }

      sessionStorage.setItem('user', JSON.stringify(data.user))

      const routes = {
        basic: '/basic',
        premium: '/premium',
        admin: '/admin'
      }
      await router.push(routes[data.user.access] || '/')
    } catch (err) {
      error.value = 'Cannot connect to the server. Please try again.'
    } finally {
      loading.value = false
    }
  }

  return { username, password, error, success, loading, login }
}