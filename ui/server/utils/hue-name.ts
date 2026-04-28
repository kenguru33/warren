export function resolveHueName(
  displayName: string | null | undefined,
  bridgeName: string | null | undefined,
  deviceId: string,
): string {
  const dn = displayName?.trim()
  if (dn) return dn
  const bn = bridgeName?.trim()
  if (bn) return bn
  return deviceId
}
