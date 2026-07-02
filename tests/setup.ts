import { expect, beforeEach, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { createMockPlatform } from './mocks/platform'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock window.location.href for axios compatibility
Object.defineProperty(window, 'location', {
  writable: true,
  value: {
    href: 'http://localhost:3000',
    origin: 'http://localhost:3000',
    protocol: 'http:',
    host: 'localhost:3000',
    hostname: 'localhost',
    port: '3000',
    pathname: '/',
    search: '',
    hash: '',
  },
})

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return []
  }
  unobserve() {}
} as any

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any

// Console methods
global.console = {
  ...console,
  error: vi.fn(),
  warn: vi.fn(),
}

// Mock lucide-react icons — stub all icon components rendering a minimal <svg>
vi.mock('lucide-react', async () => {
  const React = await import('react')
  const StubIcon = React.forwardRef(function StubIcon(props: Record<string, unknown>, ref: React.Ref<SVGSVGElement>) {
    return React.createElement('svg', { ref, ...props, 'data-testid': 'lucide-icon' })
  })
  const icons = [
    'X',
    'AlertCircle',
    'CheckCircle',
    'HelpCircle',
    'AlertTriangle',
    'RefreshCw',
    'Home',
    'Bug',
    'Trash2',
    'RotateCcw',
    'Shield',
    'Scale',
    'ChevronDown',
    'ChevronUp',
    'ExternalLink',
    'ArrowLeft',
    'Filter',
    'Settings',
    'Bell',
    'BellOff',
    'Check',
    'CheckCheck',
    'Info',
    'CheckCircle2',
    'Clock',
    'Save',
    'FolderOpen',
    'Search',
    'Navigation',
    'FileText',
    'Eye',
    'Edit',
    'Calendar',
    'Plus',
    'Upload',
    'Download',
    'BarChart3',
    'TrendingUp',
    'TrendingDown',
    'Minus',
    'Wifi',
    'WifiOff',
    'Cloud',
    'CloudOff',
    'Copy',
    'FileSpreadsheet',
    'FileJson',
    'Loader2',
    'Github',
    'Mail',
    'Heart',
    'Database',
    'HardDrive',
    'Pause',
    'Play',
    'History',
    'Zap',
    'Link2',
    'Wrench',
    'Layers',
    'ShieldAlert',
    'ShieldCheck',
    'ShieldX',
    'Activity',
    'Scan',
    'ArrowRight',
    'ChevronLeft',
    'ChevronRight',
    'XCircle',
    'GripVertical',
    'Layout',
    'EyeOff',
    'FileImage',
    'Code',
    'GitCommit',
    'GitPullRequest',
    'Package',
    'Inbox',
    'Battery',
    'Sparkles',
    'Sliders',
    'Command',
    'MonitorDot',
    'Circle',
    'Maximize2',
    'ZoomIn',
    'ZoomOut',
    'Target',
    'Menu',
    'Siren',
    'PieChart',
    'Share',
    'PenLine',
    'Bookmark',
    'Pencil',
    'LogOut',
    'Star',
    'MoreVertical',
    'MoreHorizontal',
    'ChevronsUpDown',
    'CheckIcon',
    'CrossIcon',
    'RadioGroup',
    'RadioGroupItem',
    'Label',
    'LucideIcon',
    'LucideProps',
    'Edit3',
    'FileUp',
    'FolderCog',
    'Tags',
    'Boxes',
    'FileDown',
    'CircleAlert',
    'CircleCheck',
    'CircleX',
    'Hexagon',
    'TriangleAlert',
    'BadgeCheck',
    'BadgeX',
    'BadgeAlert',
    'LayoutGrid',
    'LayoutList',
    'Tag',
    'Users',
    'Cpu',
    'Globe',
    'Lock',
    'Unlock',
    'Key',
    'FileCode',
    'File',
    'Folder',
    'FolderClosed',
    'Archive',
    'PackageOpen',
    'PackageCheck',
    'Container',
    'Ship',
    'Anchor',
    'MapPin',
    'Gauge',
    'ChartNoAxesColumn',
    'ChartBar',
    'ChartPie',
    'BadgeDollarSign',
    'DollarSign',
    'CircleDot',
    'CircleSlash',
    'Square',
    'SquareDot',
    'LifeBuoy',
    'Rocket',
    'Flame',
    'Snowflake',
  ]
  const mod: Record<string, unknown> = { __esModule: true }
  for (const name of icons) {
    mod[name] = StubIcon
  }
  return mod
})

// Mock cytoscape — jsdom doesn't support layout/DOM APIs cytoscape needs
vi.mock('cytoscape', () => {
  const mockCy = {
    container: vi.fn(() => document.createElement('div')),
    mount: vi.fn(),
    unmount: vi.fn(),
    destroy: vi.fn(),
    add: vi.fn(() => mockCy),
    remove: vi.fn(() => mockCy),
    elements: vi.fn(() => mockCy),
    nodes: vi.fn(() => mockCy),
    edges: vi.fn(() => mockCy),
    layout: vi.fn(() => ({ run: vi.fn(), stop: vi.fn(), on: vi.fn() })),
    fit: vi.fn(() => mockCy),
    center: vi.fn(() => mockCy),
    zoom: vi.fn((val) => {
      if (val === undefined) return 1
      return mockCy
    }),
    zooming: vi.fn(() => mockCy),
    style: vi.fn(() => ({
      append: vi.fn(() => ({ update: vi.fn() })),
      fromString: vi.fn(() => ({ update: vi.fn() })),
      selector: vi.fn(() => ({
        style: vi.fn(() => ({ selector: vi.fn(), update: vi.fn() })),
      })),
      update: vi.fn(),
    })),
    on: vi.fn(() => mockCy),
    off: vi.fn(() => mockCy),
    one: vi.fn(() => mockCy),
    emit: vi.fn(() => mockCy),
    ready: vi.fn((cb) => {
      if (cb) cb(mockCy)
      return mockCy
    }),
    json: vi.fn(() => ({ elements: [] })),
    width: vi.fn(() => 800),
    height: vi.fn(() => 600),
    extent: vi.fn(() => ({ x1: 0, y1: 0, x2: 800, y2: 600 })),
    autolock: vi.fn(() => mockCy),
    autoungrabify: vi.fn(() => mockCy),
    autounselectify: vi.fn(() => mockCy),
    forceRender: vi.fn(() => mockCy),
    resize: vi.fn(() => mockCy),
    animated: vi.fn(() => false),
    animate: vi.fn(() => mockCy),
    stop: vi.fn(() => mockCy),
    batch: vi.fn((cb) => {
      if (cb) cb()
    }),
    $: vi.fn(() => mockCy),
  }
  const cytoscapeFn = vi.fn(() => mockCy)
  cytoscapeFn.use = vi.fn()
  cytoscapeFn.extension = vi.fn(() => ({}))
  return { default: cytoscapeFn }
})

// Mock the platform abstraction layer (replaces old window.electronAPI mock)
const mockPlatform = createMockPlatform()

vi.mock('@/lib/platform', () => ({
  initPlatform: vi.fn(() => Promise.resolve(mockPlatform)),
  getPlatform: vi.fn(() => mockPlatform),
  isElectron: vi.fn(() => false),
}))

// Mock HTTP client and WebSocket client (used by serverAdapter)
vi.mock('@/lib/platform/httpClient', () => ({
  setAuthToken: vi.fn(),
  getStoredToken: vi.fn(() => null),
  clearAuthToken: vi.fn(),
  apiGet: vi.fn(() => Promise.resolve({ success: true })),
  apiPost: vi.fn(() => Promise.resolve({ success: true })),
  apiPut: vi.fn(() => Promise.resolve({ success: true })),
}))

vi.mock('@/lib/platform/wsClient', () => ({
  wsClient: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(() => () => {}),
    off: vi.fn(),
    emit: vi.fn(),
    isConnected: vi.fn(() => true),
  },
}))

// Mock axios to prevent window.location.href access issues
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  AxiosError: class AxiosError extends Error {
    constructor(message: string, code?: string) {
      super(message)
      this.name = 'AxiosError'
      ;(this as any).code = code
    }
  },
}))

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
})
