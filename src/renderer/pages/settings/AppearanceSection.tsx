import { Palette } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useStore } from '@/store/useStore'

/**
 * Appearance settings (theme + font size). Self-contained: reads and writes
 * only the shared settings via the store, so it needs no props from the
 * Settings orchestrator.
 */
export function AppearanceSection() {
  const { t } = useTranslation('appearanceSection')
  const { settings, updateSettings } = useStore()

  return (
    <div id="appearance" className="rounded-lg border border-border bg-card scroll-mt-6">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <Palette className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-semibold">{t('title')}</h2>
      </div>
      <div className="p-4 space-y-6">
        {/* Theme */}
        <div>
          <label className="mb-3 block text-sm font-medium">{t('theme.label')}</label>
          <div className="grid grid-cols-3 gap-3">
            {(['light', 'dark', 'system'] as const).map((theme) => (
              <button
                key={theme}
                onClick={() => updateSettings({ theme })}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                  settings.theme === theme ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                }`}
              >
                <div
                  className={`h-8 w-8 rounded-full ${
                    theme === 'light'
                      ? 'bg-white border-2 border-gray-300'
                      : theme === 'dark'
                        ? 'bg-gray-900 border-2 border-gray-700'
                        : 'bg-gradient-to-r from-white to-gray-900'
                  }`}
                />
                <span className="text-sm capitalize">{theme}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {settings.theme === 'system'
              ? t('theme.note.followsSystem')
              : t('theme.note.alwaysUse', { theme: settings.theme })}
          </p>
        </div>

        {/* Font Size */}
        <div>
          <label className="mb-3 block text-sm font-medium">{t('fontSize.label')}</label>
          <div className="grid grid-cols-3 gap-3">
            {(['small', 'default', 'large'] as const).map((size) => (
              <button
                key={size}
                onClick={() => updateSettings({ fontSize: size })}
                className={`rounded-lg border-2 p-3 transition-colors ${
                  settings.fontSize === size ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                }`}
              >
                <span className={`block ${size === 'small' ? 'text-xs' : size === 'large' ? 'text-lg' : 'text-sm'}`}>
                  {t('fontSize.preview')}
                </span>
                <span className="text-xs capitalize">{size}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t('fontSize.note')}</p>
        </div>
      </div>
    </div>
  )
}
