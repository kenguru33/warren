<script setup lang="ts">
const emit = defineEmits<{ (e: 'close'): void }>()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const success = ref(false)
const loading = ref(false)

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close')
}

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
  <Teleport to="body">
    <div class="backdrop" @click="onBackdropClick">
      <div class="modal">
        <h2 class="title">Change Password</h2>
        <form @submit.prevent="submit">
          <div class="fields">
            <label class="label">Current password</label>
            <input
              v-model="currentPassword"
              class="input"
              type="password"
              autocomplete="current-password"
              autofocus
              :disabled="success"
            />
            <label class="label">New password</label>
            <input
              v-model="newPassword"
              class="input"
              type="password"
              autocomplete="new-password"
              :disabled="success"
            />
            <label class="label">Confirm new password</label>
            <input
              v-model="confirmPassword"
              class="input"
              type="password"
              autocomplete="new-password"
              :disabled="success"
            />
          </div>
          <p v-if="error" class="error">{{ error }}</p>
          <p v-if="success" class="success-msg">Password changed successfully</p>
          <div class="actions">
            <button type="button" class="btn-cancel" @click="emit('close')">Cancel</button>
            <button
              type="submit"
              class="btn-save"
              :disabled="loading || success || !currentPassword || !newPassword || !confirmPassword"
            >
              {{ loading ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 24px;
}

.modal {
  background: #1e2130;
  border: 1px solid #2a2f45;
  border-radius: 16px;
  padding: 28px;
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #e2e8f0;
}

form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.label {
  font-size: 0.8rem;
  color: #64748b;
}

.input {
  background: #151825;
  border: 1px solid #2a2f45;
  border-radius: 8px;
  padding: 10px 14px;
  color: #e2e8f0;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
}

.input:focus {
  border-color: #4a6fa5;
}

.input:disabled {
  opacity: 0.5;
}

.error {
  font-size: 0.82rem;
  color: #fca5a5;
  margin: 0;
}

.success-msg {
  font-size: 0.82rem;
  color: #6ee7b7;
  margin: 0;
}

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-cancel,
.btn-save {
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background 0.15s;
}

.btn-cancel {
  background: #151825;
  color: #64748b;
}

.btn-cancel:hover {
  color: #94a3b8;
}

.btn-save {
  background: #4a6fa5;
  color: #fff;
}

.btn-save:hover:not(:disabled) {
  background: #6b93c7;
}

.btn-save:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
