<script setup lang="ts">
const emit = defineEmits<{ (e: 'close'): void }>()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const success = ref(false)
const loading = ref(false)

async function submit() {
  error.value = ''
  if (newPassword.value.length < 8) {
    error.value = 'New password must be at least 8 characters'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }
  loading.value = true
  try {
    await $fetch('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword: currentPassword.value, newPassword: newPassword.value },
    })
    success.value = true
    setTimeout(() => emit('close'), 1500)
  } catch (e: unknown) {
    const status = (e as { status?: number; statusMessage?: string })?.status
    error.value = status === 401
      ? 'Current password is incorrect'
      : 'Something went wrong. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AppDialog :open="true" max-width-class="max-w-md" @close="emit('close')">
    <form @submit.prevent="submit">
      <div class="px-6 pt-5 pb-4 border-b border-default">
        <h3 class="text-base/6 font-semibold text-text">Change password</h3>
        <p class="mt-1 text-sm/6 text-muted">Use at least 8 characters.</p>
      </div>

      <div class="px-6 py-5 space-y-4">
        <div>
          <label for="current-password" class="label">Current password</label>
          <input
            id="current-password"
            v-model="currentPassword"
            class="input mt-1.5"
            type="password"
            autocomplete="current-password"
            autofocus
            :disabled="success"
          />
        </div>
        <div>
          <label for="new-password" class="label">New password</label>
          <input
            id="new-password"
            v-model="newPassword"
            class="input mt-1.5"
            type="password"
            autocomplete="new-password"
            :disabled="success"
          />
        </div>
        <div>
          <label for="confirm-password" class="label">Confirm new password</label>
          <input
            id="confirm-password"
            v-model="confirmPassword"
            class="input mt-1.5"
            type="password"
            autocomplete="new-password"
            :disabled="success"
          />
        </div>
        <p v-if="error" class="rounded-lg bg-error/10 ring-1 ring-error/30 px-3 py-2 text-sm text-error">{{ error }}</p>
        <p v-if="success" class="rounded-lg bg-success/10 ring-1 ring-success/30 px-3 py-2 text-sm text-success">Password changed successfully</p>
      </div>

      <div class="flex items-center justify-end gap-2 px-6 py-4 border-t border-default bg-surface-2/50">
        <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
        <button
          type="submit"
          class="btn-primary"
          :disabled="loading || success || !currentPassword || !newPassword || !confirmPassword"
        >{{ loading ? 'Saving…' : 'Save' }}</button>
      </div>
    </form>
  </AppDialog>
</template>
