<script setup lang="ts">
defineProps<{
  cameraName: string
  streamUrl: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="backdrop" @click="onBackdropClick">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">{{ cameraName }}</span>
          <div class="live-indicator">
            <span class="live-dot" />
            LIVE
          </div>
          <button class="close-btn" @click="emit('close')">&times;</button>
        </div>
        <div class="stream-area">
          <!-- Replace with <img :src="streamUrl" /> for MJPEG or <video> for HLS/RTSP -->
          <div v-if="!streamUrl" class="stream-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
              <circle cx="12" cy="13" r="3"/>
            </svg>
            <p>Stream URL not configured</p>
          </div>
          <img v-else :src="streamUrl" alt="Live stream" class="stream" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
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
  width: 100%;
  max-width: 900px;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid #2a2f45;
}

.modal-title {
  font-size: 1rem;
  font-weight: 600;
  color: #e2e8f0;
  flex: 1;
}

.live-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #f87171;
  letter-spacing: 0.08em;
}

.live-dot {
  width: 8px;
  height: 8px;
  background: #ef4444;
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}

.close-btn {
  background: none;
  border: none;
  color: #64748b;
  font-size: 1.5rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
  transition: color 0.15s;
}

.close-btn:hover {
  color: #e2e8f0;
}

.stream-area {
  aspect-ratio: 16 / 9;
  background: #0f1117;
}

.stream {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.stream-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: #334155;
  font-size: 0.85rem;
}
</style>
