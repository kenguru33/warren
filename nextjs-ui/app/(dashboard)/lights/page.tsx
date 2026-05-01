export default function LightsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl/8 font-semibold tracking-tight text-text">Lights</h1>
      <div className="card p-8 text-center">
        <p className="text-sm/6 text-subtle">
          The full lights control UI is being ported. The API behind it
          (<code>/api/lights/master-state</code>, <code>/api/light-groups/[id]/state</code>) is already live.
        </p>
      </div>
    </div>
  )
}
