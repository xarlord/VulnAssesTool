import React from 'react'
import { cn } from '@/lib/utils'
import { useSidebarOpen } from '@/store/useStore'
import { Sidebar } from './Sidebar'

export interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const sidebarOpen = useSidebarOpen()

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className={cn('min-h-screen transition-all duration-300', sidebarOpen ? 'ml-56' : 'ml-14')}>
        {children}
      </main>
    </div>
  )
}
