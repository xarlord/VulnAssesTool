import { PageHeader } from '@/components/PageHeader'
import { AuditLogPanel } from '@/components/audit'

/**
 * Audit Log page — the compliance record of CREATE, UPDATE, DELETE, SCAN, EXPORT,
 * and SETTINGS_CHANGE events. Reachable from the primary sidebar so the audit trail
 * the app already records is actually viewable and exportable by an operator.
 */
export function AuditLog() {
  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Audit Log"
          description="Compliance record of CREATE, UPDATE, DELETE, SCAN, EXPORT, and SETTINGS_CHANGE events."
        />
        <div className="mt-6">
          <AuditLogPanel />
        </div>
      </div>
    </div>
  )
}
