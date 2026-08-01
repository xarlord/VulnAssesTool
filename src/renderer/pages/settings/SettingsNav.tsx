import { UserCircle, Palette, Key, Database, Archive, Gauge, FileText, Shield, AlertTriangle, Bell } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface NavItem {
  id: string
  label: string
  icon: LucideIcon
}

const SECTIONS: NavItem[] = [
  { id: 'profiles', label: 'Profiles', icon: UserCircle },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'api', label: 'API', icon: Key },
  { id: 'database', label: 'Database', icon: Database },
  { id: 'backup', label: 'Backup', icon: Archive },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'data-management', label: 'Data Management', icon: FileText },
  { id: 'threat-intel', label: 'Threat Intel', icon: Shield },
  { id: 'danger-zone', label: 'Danger Zone', icon: AlertTriangle },
]

/**
 * Sticky in-page nav for the Settings sections. Anchors jump to each section
 * (which keeps every section mounted, so all-sections-visible assertions and
 * scroll-to-section both work). Hidden on narrow viewports where the sections
 * simply stack.
 */
export function SettingsNav() {
  return (
    <nav aria-label="Settings sections" className="hidden lg:block">
      <ul className="sticky top-6 space-y-1">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
