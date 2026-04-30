/**
 * AppLogo - Application logo component with light/dark mode support
 *
 * Displays the application logo with appropriate background based on theme:
 * - Light mode: White background
 * - Dark mode: Dark background
 */

import React from 'react'
import { useSettings } from '@/store/useStore'

export interface AppLogoProps {
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Show app name next to logo */
  showText?: boolean
  /** Additional class names */
  className?: string
}

const sizeMap = {
  sm: { height: 24, containerHeight: 'h-6' },
  md: { height: 32, containerHeight: 'h-8' },
  lg: { height: 48, containerHeight: 'h-12' },
}

export function AppLogo({ size = 'md', showText = true, className = '' }: AppLogoProps) {
  const settings = useSettings()

  // Determine if we're in dark mode
  const [isDark, setIsDark] = React.useState(false)
  const [imageError, setImageError] = React.useState(false)

  React.useEffect(() => {
    const updateTheme = () => {
      const theme =
        settings.theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : settings.theme
      setIsDark(theme === 'dark')
    }

    updateTheme()

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', updateTheme)

    return () => mediaQuery.removeEventListener('change', updateTheme)
  }, [settings.theme])

  const { height, containerHeight } = sizeMap[size]

  // Fallback SVG shield icon - safe React component instead of innerHTML
  const FallbackIcon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={height}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      stroke={isDark ? '#60a5fa' : '#3b82f6'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Logo container with theme-appropriate background */}
      <div
        className={`${containerHeight} flex items-center justify-center rounded-lg p-1 transition-colors`}
        style={{
          backgroundColor: isDark ? '#1f2937' : '#ffffff', // gray-800 for dark, white for light
        }}
      >
        {imageError ? (
          FallbackIcon
        ) : (
          <img
            src={isDark ? '/logo-dark.png' : '/logo-light.png'}
            alt="VulnAssessTool"
            height={height}
            className="h-full w-auto object-contain"
            onError={() => setImageError(true)}
          />
        )}
      </div>
      {showText && <h1 className="text-2xl font-bold">VulnAssessTool</h1>}
    </div>
  )
}

export default AppLogo
