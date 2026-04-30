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
  <div class="grid min-h-svh place-items-center px-4 py-12 sm:px-6 lg:px-8">
    <div class="w-full max-w-sm">
      <!-- Brand mark -->
      <div class="flex flex-col items-center gap-3">
        <span class="inline-flex size-12 items-center justify-center rounded-xl bg-stone-900 text-white shadow-sm dark:bg-white dark:text-stone-950">
          <svg class="size-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="8.5" cy="6" rx="2.5" ry="5" fill="currentColor" />
            <ellipse cx="15.5" cy="6" rx="2.5" ry="5" fill="currentColor" />
            <circle cx="12" cy="17" r="6" fill="currentColor" />
            <circle cx="10" cy="16" r="0.9" class="fill-stone-900 dark:fill-white" />
            <circle cx="14" cy="16" r="0.9" class="fill-stone-900 dark:fill-white" />
          </svg>
        </span>
        <h1 class="text-xl/7 font-semibold tracking-tight text-text">
          Sign in to Warren
        </h1>
        <p class="text-sm/6 text-subtle">Your home, at a glance.</p>
      </div>

      <!-- Form card -->
      <form
        class="mt-8 space-y-6 rounded-xl bg-surface p-6 shadow-sm ring-1 ring-default sm:p-8 dark:ring-white/10 dark:shadow-none"
        @submit.prevent="submit"
      >
        <div class="space-y-1.5">
          <label for="username" class="label">Username</label>
          <input
            id="username"
            v-model="username"
            type="text"
            autocomplete="username"
            autofocus
            required
            class="input"
          />
        </div>

        <div class="space-y-1.5">
          <label for="password" class="label">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            class="input"
          />
        </div>

        <div
          v-if="error"
          class="rounded-md bg-red-50 px-3 py-2 text-sm/6 text-red-700 ring-1 ring-inset ring-red-600/10 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20"
        >
          {{ error }}
        </div>

        <button type="submit" :disabled="busy" class="btn-primary w-full">
          {{ busy ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
    </div>
  </div>
</template>
