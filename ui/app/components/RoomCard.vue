<script setup lang="ts">
import type { RoomWithSensors, SensorView } from '../../shared/types'

const props = defineProps<{ room: RoomWithSensors }>()

const emit = defineEmits<{
  (e: 'save-ref', roomId: number, refTemp: number | null, refHumidity: number | null): void
  (e: 'remove-room', roomId: number): void
  (e: 'remove-sensor', sensorId: number): void
  (e: 'rename-room', roomId: number, name: string): void
  (e: 'add-sensor', roomId: number): void
  (e: 'open-live', sensorId: number): void
  (e: 'view-history', sensor: SensorView): void
  (e: 'edit-sensor', sensorId: number): void
  (e: 'add-group', roomId: number): void
  (e: 'edit-group', groupId: number): void
  (e: 'ungroup', groupId: number): void
  (e: 'master-toggled'): void
}>()

const tempSensor    = computed(() => props.room.sensors.find(s => s.type === 'temperature') ?? null)
const humSensor     = computed(() => props.room.sensors.find(s => s.type === 'humidity')    ?? null)
const motionSensor  = computed(() => props.room.sensors.find(s => s.type === 'motion')      ?? null)
const cameras       = computed(() => props.room.sensors.filter(s => s.type === 'camera'))
const lights        = computed(() => props.room.sensors.filter(s => s.type === 'light'))
const ungroupedLights = computed(() => lights.value.filter(l => !l.groupId))
const hasClimate    = computed(() => tempSensor.value || humSensor.value)
const lightGroups   = computed(() => props.room.lightGroups ?? [])
const lightsById    = computed(() => new Map(lights.value.map(l => [l.id, l])))

const hasAmbient = computed(() => !!(tempSensor.value || humSensor.value || motionSensor.value))
const hasCamera  = computed(() => cameras.value.length > 0)
const hasLighting = computed(() => lightGroups.value.length > 0 || ungroupedLights.value.length > 0)
const hasAnyContent = computed(() => hasAmbient.value || hasCamera.value || hasLighting.value)

const editing        = ref(false)
const refTempEnabled = ref(props.room.reference !== null && props.room.reference.refTemp !== null)
const refHumEnabled  = ref(props.room.reference !== null && props.room.reference.refHumidity !== null)
const refTemp        = ref(props.room.reference?.refTemp     ?? 21)
const refHumidity    = ref(props.room.reference?.refHumidity ?? 50)
const editName       = ref(props.room.name)

const confirmRoom   = ref(false)
const detailGroupId = ref<number | null>(null)

const detailGroup = computed(() => {
  if (detailGroupId.value === null) return null
  return lightGroups.value.find(g => g.id === detailGroupId.value) ?? null
})

const detailGroupMembers = computed<SensorView[]>(() => {
  const g = detailGroup.value
  if (!g) return []
  return g.memberSensorIds
    .map(id => lightsById.value.get(id))
    .filter((s): s is SensorView => !!s)
})

// Master switch state — optimistic on tap, reconciles with next /api/rooms refresh.
const masterPending = ref(false)
const masterError = ref<string | null>(null)
const masterPartial = ref<{ ok: number; failed: number } | null>(null)

async function toggleRoomMaster(nextOn: boolean) {
  if (masterPending.value) return
  masterPending.value = true
  masterError.value = null
  masterPartial.value = null
  try {
    const res = await $fetch<{ successCount: number; failureCount: number; total: number }>(
      `/api/rooms/${props.room.id}/lights-state`,
      { method: 'POST', body: { on: nextOn } },
    )
    if (res.failureCount > 0) {
      masterPartial.value = { ok: res.successCount, failed: res.failureCount }
    }
    emit('master-toggled')
  } catch (err: unknown) {
    const e = err as { data?: { error?: string }; message?: string }
    masterError.value = e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed')
  } finally {
    masterPending.value = false
  }
}

watch(() => props.room.reference, (ref) => {
  if (!editing.value) {
    refTempEnabled.value = ref !== null && ref.refTemp !== null
    refHumEnabled.value  = ref !== null && ref.refHumidity !== null
    refTemp.value        = ref?.refTemp     ?? 21
    refHumidity.value    = ref?.refHumidity ?? 50
  }
})

watch(editing, (open) => {
  if (open) {
    refTempEnabled.value = props.room.reference !== null && props.room.reference.refTemp !== null
    refHumEnabled.value  = props.room.reference !== null && props.room.reference.refHumidity !== null
    refTemp.value        = props.room.reference?.refTemp     ?? 21
    refHumidity.value    = props.room.reference?.refHumidity ?? 50
    editName.value       = props.room.name
  }
})

function saveRef() {
  if (editName.value.trim() && editName.value.trim() !== props.room.name) {
    emit('rename-room', props.room.id, editName.value.trim())
  }
  emit('save-ref', props.room.id,
    refTempEnabled.value ? refTemp.value : null,
    refHumEnabled.value  ? refHumidity.value : null,
  )
  editing.value = false
}

function closeEditing() {
  if (editName.value.trim() && editName.value.trim() !== props.room.name) {
    emit('rename-room', props.room.id, editName.value.trim())
  }
  editing.value = false
}

function motionLabelFor(ts: number | null) {
  if (!ts) return null
  const diff = Math.round((Date.now() - ts) / 1000)
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  return `${Math.round(diff / 3600)}h ago`
}

function recentMotion(ts: number | null) {
  return ts ? Date.now() - ts < 5 * 60 * 1000 : false
}

const now = ref(Date.now())
onMounted(() => {
  const t = setInterval(() => { now.value = Date.now() }, 10_000)
  onUnmounted(() => clearInterval(t))
})
function isOffline(ms: number | null) {
  return !ms || now.value - ms > 30_000
}
</script>

<template>
  <div class="group/room relative rounded-xl bg-surface p-6 ring-1 ring-default shadow-sm dark:ring-white/10 dark:shadow-none [container-type:inline-size]">
    <!-- Header — Catalyst's card header pattern: bold semibold heading + ghost icon row -->
    <div class="flex items-center justify-between gap-3 min-h-[32px]">
      <input
        v-if="editing"
        v-model="editName"
        class="flex-1 min-w-0 rounded-lg border border-default bg-input px-3 py-1.5 text-base/6 font-semibold tracking-tight text-text outline-none focus:border-default focus:ring-2 focus:ring-accent focus:ring-inset dark:border-white/10"
        maxlength="60"
        @keydown.enter="closeEditing"
        @keydown.escape="editing = false"
      />
      <h2 v-else class="truncate text-base/6 font-semibold text-text">{{ room.name }}</h2>

      <div class="flex items-center gap-1 ml-auto">
        <MasterLightToggle
          v-if="room.lightMaster"
          :master="room.lightMaster"
          :pending="masterPending"
          :error="masterError"
          :partial="masterPartial"
          @toggle="toggleRoomMaster"
        />
        <div :class="['flex items-center gap-0.5 transition-opacity', editing ? 'opacity-100' : 'opacity-0 group-hover/room:opacity-100 group-focus-within/room:opacity-100']">
          <button class="btn-icon !size-8" title="Add sensor" @click="emit('add-sensor', room.id)">
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <button :class="['btn-icon !size-8', editing && '!bg-default !text-text dark:!bg-white/10 dark:!text-white']" title="Edit room" @click="editing ? closeEditing() : (editing = true)">
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          </button>
          <button class="btn-icon !size-8 hover:!text-red-600 dark:hover:!text-red-400" title="Remove room" @click="confirmRoom = true">
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Sectioned content -->
    <div v-if="hasAnyContent" class="mt-6 flex flex-col gap-5 [&>*+*]:pt-5 [&>*+*]:border-t [&>*+*]:border-default dark:[&>*+*]:border-white/5">
      <!-- Ambient: temperature, humidity, motion -->
      <div v-if="hasAmbient" class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
        <ClimateTile
          v-if="tempSensor"
          variant="temperature"
          :sensor="tempSensor"
          :reference="room.reference"
          :editing="editing"
          :is-offline="isOffline(tempSensor.lastRecordedAt)"
          @view-history="(s) => emit('view-history', s)"
          @edit-sensor="(id) => emit('edit-sensor', id)"
          @remove-sensor="(id) => emit('remove-sensor', id)"
        />
        <ClimateTile
          v-if="humSensor"
          variant="humidity"
          :sensor="humSensor"
          :reference="room.reference"
          :editing="editing"
          :is-offline="isOffline(humSensor.lastRecordedAt)"
          @view-history="(s) => emit('view-history', s)"
          @edit-sensor="(id) => emit('edit-sensor', id)"
          @remove-sensor="(id) => emit('remove-sensor', id)"
        />
        <MotionTile
          v-if="motionSensor"
          :sensor="motionSensor"
          :editing="editing"
          :is-offline="isOffline(motionSensor.lastRecordedAt)"
          :recent-motion="recentMotion(motionSensor.lastMotion)"
          :motion-label="motionLabelFor(motionSensor.lastMotion)"
          @view-history="(s) => emit('view-history', s)"
          @edit-sensor="(id) => emit('edit-sensor', id)"
          @remove-sensor="(id) => emit('remove-sensor', id)"
        />
      </div>

      <!-- Cameras -->
      <div v-if="hasCamera" class="grid grid-cols-1 gap-3">
        <CameraTile
          v-for="cam in cameras"
          :key="cam.id"
          :sensor="cam"
          :editing="editing"
          :recent-motion="recentMotion(cam.lastMotion)"
          @open-live="(id) => emit('open-live', id)"
          @edit-sensor="(id) => emit('edit-sensor', id)"
          @remove-sensor="(id) => emit('remove-sensor', id)"
        />
      </div>

      <!-- Lighting -->
      <div v-if="hasLighting" class="flex flex-col gap-3">
        <div v-if="lightGroups.length" class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          <LightGroupTile
            v-for="group in lightGroups"
            :key="`group-${group.id}`"
            :group="group"
            :members="group.memberSensorIds.map(id => lightsById.get(id)).filter((s): s is SensorView => !!s)"
            :editing="editing"
            @edit-group="(id) => emit('edit-group', id)"
            @ungroup="(id) => emit('ungroup', id)"
            @open-detail="(id) => detailGroupId = id"
            @toggled="emit('master-toggled')"
          />
        </div>
        <div v-if="ungroupedLights.length" class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          <HueLightTile
            v-for="light in ungroupedLights"
            :key="light.id"
            :sensor="light"
            :editing="editing"
            @edit-sensor="(id) => emit('edit-sensor', id)"
            @remove-sensor="(id) => emit('remove-sensor', id)"
            @toggled="emit('master-toggled')"
          />
        </div>
      </div>
    </div>

    <!-- Group affordance -->
    <Transition name="slide">
      <div v-if="editing && lights.length >= 2" class="mt-5 pt-4 border-t border-default dark:border-white/5">
        <button
          class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-strong px-3 py-1.5 text-xs/5 font-medium text-muted hover:text-text hover:border-strong dark:border-white/15 dark:hover:text-white dark:hover:border-white/30 transition-colors"
          @click="emit('add-group', room.id)"
        >
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Group lights
        </button>
      </div>
    </Transition>

    <!-- Edit panel: per-sensor target toggles -->
    <Transition name="slide">
      <div v-if="editing && hasClimate" class="mt-5 pt-5 border-t border-default dark:border-white/5 flex flex-col gap-5">
        <div v-if="tempSensor" class="flex flex-col gap-2.5">
          <div class="flex items-center justify-between">
            <span class="text-sm/6 font-medium text-muted">Target temperature</span>
            <AppSwitch :model-value="refTempEnabled" @update:model-value="(v) => (refTempEnabled = v)" label="Enable target" />
          </div>
          <Transition name="slide">
            <div v-if="refTempEnabled" class="flex flex-col gap-1.5 overflow-hidden">
              <div class="text-sm/6 font-semibold text-text">{{ refTemp }}°C</div>
              <input v-model.number="refTemp" type="range" min="10" max="30" step="0.5" class="slider" />
              <div class="flex justify-between text-[0.65rem] text-subtle"><span>10°</span><span>20°</span><span>30°</span></div>
            </div>
          </Transition>
        </div>

        <div v-if="humSensor" class="flex flex-col gap-2.5">
          <div class="flex items-center justify-between">
            <span class="text-sm/6 font-medium text-muted">Target humidity</span>
            <AppSwitch :model-value="refHumEnabled" @update:model-value="(v) => (refHumEnabled = v)" label="Enable target" />
          </div>
          <Transition name="slide">
            <div v-if="refHumEnabled" class="flex flex-col gap-1.5 overflow-hidden">
              <div class="text-sm/6 font-semibold text-text">{{ refHumidity }}%</div>
              <input v-model.number="refHumidity" type="range" min="20" max="80" step="1" class="slider" />
              <div class="flex justify-between text-[0.65rem] text-subtle"><span>20%</span><span>50%</span><span>80%</span></div>
            </div>
          </Transition>
        </div>

        <div class="flex justify-end">
          <button class="btn-primary btn-sm" @click="saveRef">Save</button>
        </div>
      </div>
    </Transition>
  </div>

  <ConfirmDialog
    v-if="confirmRoom"
    :message="`Delete room &quot;${room.name}&quot;? This will also remove all its sensors.`"
    @confirm="emit('remove-room', room.id); confirmRoom = false"
    @cancel="confirmRoom = false"
  />

  <LightGroupDetailModal
    v-if="detailGroup"
    :group="detailGroup"
    :members="detailGroupMembers"
    @close="detailGroupId = null"
    @toggled="emit('master-toggled')"
  />
</template>

<style scoped>
/* Slide transition for the edit panel — utilities can't express this cleanly. */
.slide-enter-active,
.slide-leave-active {
  transition: max-height 0.25s ease, opacity 0.2s ease;
  max-height: 500px;
  overflow: hidden;
}
.slide-enter-from,
.slide-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
