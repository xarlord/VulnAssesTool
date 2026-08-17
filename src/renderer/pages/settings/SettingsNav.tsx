import {
  UserCircle,
  Palette,
  Key,
  Database,
  Archive,
  Gauge,
  FileText,
  Shield,
  ShieldAlert,
  AlertTriangle,
  Bell,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface NavItem {
  id: string
  /** i18n key (settingsNav namespace) for the visible label. */
  labelKey: string
  icon: LucideIcon
}

const SECTIONS: NavItem[] = [
  { id: 'profiles', labelKey: 'sections.profiles', icon: UserCircle },
  { id: 'appearance', labelKey: 'sections.appearance', icon: Palette },
  { id: 'notifications', labelKey: 'sections.notifications', icon: Bell },
  { id: 'cvss', labelKey: 'sections.cvss', icon: ShieldAlert },
  { id: 'api', labelKey: 'sections.api', icon: Key },
  { id: 'database', labelKey: 'sections.database', icon: Database },
  { id: 'backup', labelKey: 'sections.backup', icon: Archive },
  { id: 'performance', labelKey: 'sections.performance', icon: Gauge },
  { id: 'data-management', labelKey: 'sections.dataManagement', icon: FileText },
  { id: 'threat-intel', labelKey: 'sections.threatIntel', icon: Shield },
  { id: 'danger-zone', labelKey: 'sections.dangerZone', icon: AlertTriangle },
]

/**
 * Sticky in-page nav for the Settings sections. Anchors jump to each section
 * (which keeps every section mounted, so all-sections-visible assertions and
 * scroll-to-section both work). Hidden on narrow viewports where the sections
 * simply stack.
 */
export function SettingsNav() {
  const { t } = useTranslation('settingsNav')
  return (
    <nav aria-label={t('ariaLabel')} className="hidden lg:block">
      <ul className="sticky top-6 space-y-1">
        {SECTIONS.map(({ id, labelKey, icon: Icon }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Icon className="h-4 w-4 shrink-0" />
              {t(labelKey)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
