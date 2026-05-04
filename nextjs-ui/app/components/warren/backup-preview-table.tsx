'use client'

import type { BackupTableName, SnapshotHeader } from '@/lib/shared/backup'
import { BACKUP_TABLES } from '@/lib/shared/backup'

interface PreviewProps {
  preview: {
    header: SnapshotHeader
    warnings: string[]
    errors: string[]
    compatible: boolean
  }
}

function fmtTime(ms: number) {
  return new Date(ms).toLocaleString()
}

export function BackupPreviewTable({ preview }: PreviewProps) {
  const { header, warnings, errors, compatible } = preview
  const counts = header.row_counts

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wider text-subtle">Schema</dt>
          <dd className="mt-0.5 text-text tabular-nums">v{header.schema_version}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-subtle">App version</dt>
          <dd className="mt-0.5 text-text">{header.app_version}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs uppercase tracking-wider text-subtle">Exported at</dt>
          <dd className="mt-0.5 text-text">{fmtTime(header.exported_at)}</dd>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-xs uppercase tracking-wider text-subtle">Host id</dt>
          <dd className="mt-0.5 break-all font-mono text-xs text-subtle">{header.host_id ?? '—'}</dd>
        </div>
      </dl>

      <div className="overflow-hidden rounded-lg ring-1 ring-default dark:ring-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-subtle">
            <tr>
              <th className="px-3 py-2 font-medium">Table</th>
              <th className="px-3 py-2 text-right font-medium">Rows</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-default">
            {BACKUP_TABLES.map((name: BackupTableName) => (
              <tr key={name}>
                <td className="px-3 py-1.5 font-mono text-xs text-text">{name}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-text">
                  {counts[name] ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-error/10 px-3 py-2 text-sm text-error ring-1 ring-error/30">
          {errors.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}

      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-400">
          {warnings.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}

      {!compatible && errors.length === 0 && (
        <div className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error ring-1 ring-error/30">
          Snapshot is not compatible with this Warren version.
        </div>
      )}
    </div>
  )
}
