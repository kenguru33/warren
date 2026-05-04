import { Heading } from '@/app/components/heading'
import { Text } from '@/app/components/text'
import { BackupRestoreCard } from '@/app/components/warren/backup-restore-card'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <Heading>Settings</Heading>
        <Text className="mt-1">Operator-only configuration for this Warren install.</Text>
      </div>
      <BackupRestoreCard />
    </div>
  )
}
