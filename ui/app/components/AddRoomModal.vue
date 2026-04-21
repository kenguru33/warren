<script setup lang="ts">
const emit = defineEmits<{
  (e: 'add', name: string): void
  (e: 'close'): void
}>()

const name = ref('')

function submit() {
  if (name.value.trim()) {
    emit('add', name.value.trim())
    name.value = ''
  }
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="backdrop" @click="onBackdropClick">
      <div class="modal">
        <h2 class="title">Add Room</h2>
        <form @submit.prevent="submit">
          <input
            v-model="name"
            class="input"
            placeholder="Room name"
            autofocus
            maxlength="60"
          />
          <div class="actions">
            <button type="button" class="btn-cancel" @click="emit('close')">Cancel</button>
            <button type="submit" class="btn-add" :disabled="!name.trim()">Add room</button>
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
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 24px;
}

.modal {
  background: #1e2130;
  border: 1px solid #2a2f45;
  border-radius: 16px;
  padding: 28px;
  width: 100%;
  max-width: 400px;
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

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-cancel,
.btn-add {
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

.btn-cancel:hover { color: #94a3b8; }

.btn-add {
  background: #4a6fa5;
  color: #fff;
}

.btn-add:hover:not(:disabled) { background: #6b93c7; }
.btn-add:disabled { opacity: 0.4; cursor: default; }
</style>
