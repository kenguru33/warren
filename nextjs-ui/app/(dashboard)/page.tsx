'use client'

import { useRooms } from '@/lib/hooks/use-rooms'
import { RoomCard } from '@/app/components/warren/room-card'

export default function DashboardPage() {
  const { rooms, lastUpdated } = useRooms()

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl/8 font-semibold tracking-tight text-text">Dashboard</h1>
          <p className="text-sm/6 text-subtle mt-1">Last updated {lastUpdated}</p>
        </div>
      </div>

      {rooms.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm/6 text-subtle">
            No rooms yet. Rooms appear here once you create one and assign sensors to it.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {rooms.map(room => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      )}
    </div>
  )
}
