<script setup lang="ts">
const props = defineProps<{
  id: string
  name: string
  location: string
  snapshotUrl: string | null
  lastMotion: Date | null
  streamUrl: string | null
}>()

const emit = defineEmits<{
  (e: 'open-live', id: string): void
}>()

function formatMotion(date: Date | null) {
  if (!date) return null
  const diff = Math.round((Date.now() - date.getTime()) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`
  return `${Math.round(diff / 3600)}h ago`
}

const motionLabel = computed(() => formatMotion(props.lastMotion))
const recentMotion = computed(() =>
  props.lastMotion ? Date.now() - props.lastMotion.getTime() < 5 * 60 * 1000 : false
)
</script>

<template>
  <div class="camera-card">
    <div class="snapshot-area" @click="emit('open-live', id)">
      <img v-if="snapshotUrl" :src="snapshotUrl" :alt="name" class="snapshot" />
      <div v-else class="snapshot-placeholder">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
          <circle cx="12" cy="13" r="3"/>
        </svg>
        <span>No snapshot</span>
      </div>
      <div class="live-overlay">
        <span class="live-btn">&#9654; Live</span>
      </div>
      <div v-if="recentMotion" class="motion-badge">Motion</div>
    </div>

    <div class="camera-info">
      <div>
        <p class="camera-name">{{ name }}</p>
        <p class="camera-location">{{ location }}</p>
      </div>
      <span v-if="motionLabel" class="motion-time" :class="{ recent: recentMotion }">
        {{ motionLabel }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.camera-card {
  background: #1e2130;
  border: 1px solid #2a2f45;
  border-radius: 16px;
  overflow: hidden;
  transition: border-color 0.2s;
}

.camera-card:hover {
  border-color: #4a6fa5;
}

.snapshot-area {
  position: relative;
  aspect-ratio: 16 / 9;
  background: #151825;
  cursor: pointer;
  overflow: hidden;
}

.snapshot {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.snapshot-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #334155;
  font-size: 0.8rem;
}

.live-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  opacity: 0;
  transition: opacity 0.2s;
}

.snapshot-area:hover .live-overlay {
  opacity: 1;
}

.live-btn {
  background: rgba(74, 111, 165, 0.9);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 8px 18px;
  border-radius: 20px;
  letter-spacing: 0.04em;
}

.motion-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  background: #ef4444;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.camera-info {
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.camera-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: #e2e8f0;
}

.camera-location {
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 2px;
}

.motion-time {
  font-size: 0.75rem;
  color: #475569;
  white-space: nowrap;
}

.motion-time.recent {
  color: #f87171;
}
</style>
