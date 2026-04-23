<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { fetch: fetchSession } = useUserSession()

const username = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { username: username.value, password: password.value },
    })
    await fetchSession()
    await navigateTo('/')
  } catch (e: any) {
    error.value = e?.statusCode === 401 ? 'Invalid credentials' : 'Login failed'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="login-wrap">
    <form class="card" @submit.prevent="submit">
      <div class="brand">
        <svg class="brand-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="8.5" cy="6" rx="2.5" ry="5" fill="currentColor"/>
          <ellipse cx="15.5" cy="6" rx="2.5" ry="5" fill="currentColor"/>
          <ellipse cx="8.5" cy="6.5" rx="1.2" ry="3.5" fill="#4a6fa5"/>
          <ellipse cx="15.5" cy="6.5" rx="1.2" ry="3.5" fill="#4a6fa5"/>
          <circle cx="12" cy="17" r="6" fill="currentColor"/>
          <circle cx="10" cy="16" r="0.9" fill="#161a26"/>
          <circle cx="14" cy="16" r="0.9" fill="#161a26"/>
          <circle cx="12" cy="18.5" r="0.7" fill="#4a6fa5"/>
        </svg>
        <h1 class="title">Warren</h1>
      </div>
      <p class="subtitle">Your home, at a glance</p>

      <label class="field">
        <span>Username</span>
        <input v-model="username" type="text" autocomplete="username" autofocus required>
      </label>

      <label class="field">
        <span>Password</span>
        <input v-model="password" type="password" autocomplete="current-password" required>
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <button class="btn" type="submit" :disabled="busy">
        {{ busy ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.card {
  width: 100%;
  max-width: 360px;
  background: #161a26;
  border: 1px solid #2a2f45;
  border-radius: 12px;
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 8px 0 20px;
  border-bottom: 1px solid #2a2f45;
  margin-bottom: 4px;
}

.brand-icon {
  width: 64px;
  height: 64px;
  color: #e2e8f0;
  filter: drop-shadow(0 0 12px rgba(74, 111, 165, 0.6));
}

.title {
  font-size: 2rem;
  font-weight: 900;
  letter-spacing: -0.03em;
  background: linear-gradient(135deg, #f1f5f9 20%, #7ab3e0 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  font-size: 0.8rem;
  color: #475569;
  margin-top: -8px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.8rem;
  color: #94a3b8;
}

.field input {
  background: #0f1117;
  border: 1px solid #2a2f45;
  border-radius: 8px;
  padding: 10px 12px;
  color: #e2e8f0;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.15s;
}

.field input:focus { border-color: #4a6fa5; }

.error {
  color: #f87171;
  font-size: 0.85rem;
}

.btn {
  background: #4a6fa5;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  margin-top: 4px;
}

.btn:hover:not(:disabled) { background: #6b93c7; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
