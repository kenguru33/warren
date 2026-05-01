export default function HueIntegrationPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl/8 font-semibold tracking-tight text-text">Hue Bridge</h1>
      <div className="card p-8 text-center">
        <p className="text-sm/6 text-subtle">
          The Hue setup UI is being ported. The pairing endpoint (<code>POST /api/integrations/hue/pair</code>)
          and the status/devices/sync APIs are already live.
        </p>
      </div>
    </div>
  )
}
