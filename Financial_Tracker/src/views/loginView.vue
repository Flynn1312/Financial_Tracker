<script setup>
import { useLogin } from '../model/login_handle.js'

const { username, password, error, success, loading, login } = useLogin()
</script>

<template>
  <main class="login-page">
    <form class="login-form" @submit.prevent="login">
      <h1>Welcome back</h1>
      <p>Sign in to your account</p>

      <label for="username">Username</label>
      <input
        id="username"
        v-model.trim="username"
        type="text"
        placeholder="Enter your username"
        autocomplete="username"
        required
      />

      <label for="password">Password</label>
      <input
        id="password"
        v-model="password"
        type="password"
        placeholder="Enter your password"
        autocomplete="current-password"
        required
      />

      <p v-if="error" class="error" role="alert">
        {{ error }}
      </p>

      <p v-if="success" class="success" role="status">
        {{ success }}
      </p>

      <button type="submit" :disabled="loading" style="margin-top: 20px;">
        {{ loading ? 'Signing in...' : 'Sign in' }}
      </button>
      <p class="register-link">
        Don't have an account?
        <RouterLink to="/register">Sign up</RouterLink>
      </p>
    </form>
  </main>
</template>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Arial, sans-serif;
}

.login-page {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background: #085c47;
}

.login-form {
  width: 100%;
  max-width: 400px;
  padding: 32px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(8px);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

h1 {
  margin: 0 0 8px;
  font-size: 28px;
}

.login-form > p:first-of-type {
  color: #060606;
  margin-bottom: 28px;
}

label {
  display: block;
  margin: 16px 0 8px;
  font-weight: 600;
}

input {
  display: block;
  width: 100%;
  padding: 12px;
  margin-bottom: 26px;
  margin-top: 8px;
  border: 1px solid #cccccc;
  border-radius: 6px;
  font-size: 16px;
  background: #ffffff;
}

input:focus {
  outline: 2px solid #085c47;
  outline-offset: 2px;
}

button {
  width: 100%;
  margin-top: 24px;
  padding: 13px;
  border: none;
  border-radius: 6px;
  background: #085c47;
  color: white;
  font-size: 16px;
  cursor: pointer;
}

button:hover {
  background: #085c47;
}

.error {
  color: #b91c1c;
}

.success {
  color: #15803d;
}

.login-form .register-link {
  margin-top: 20px;
  padding-top: 30px;
  text-align: center;
  font-size: 14px;
  color: #090909;
}

.login-form .register-link a {
  color: #085c47;
  text-decoration: none;
}

.login-form .register-link a:hover {
  text-decoration: underline;
}
</style>
