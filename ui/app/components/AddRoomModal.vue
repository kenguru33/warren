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
</script>

<template>
  <AppDialog :open="true" max-width-class="max-w-md" @close="emit('close')">
    <form @submit.prevent="submit">
      <div class="px-6 pt-5 pb-4 border-b border-default">
        <h3 class="text-base/6 font-semibold text-text">Add room</h3>
        <p class="mt-1 text-sm/6 text-muted">Group sensors and lights by room.</p>
      </div>

      <div class="px-6 py-5 space-y-4">
        <div>
          <label for="room-name" class="label">Room name</label>
          <input
            id="room-name"
            v-model="name"
            class="input mt-1.5"
            placeholder="e.g. Living room"
            autofocus
            maxlength="60"
          />
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 px-6 py-4 border-t border-default bg-surface-2/50">
        <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn-primary" :disabled="!name.trim()">Add room</button>
      </div>
    </form>
  </AppDialog>
</template>
