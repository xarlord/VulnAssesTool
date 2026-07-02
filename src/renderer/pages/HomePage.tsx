import { useNavigate } from 'react-router-dom'
import {
  Shield,
  Plus,
  Upload,
  Search,
  BarChart3,
  FileText,
  ArrowRight,
  ChevronRight,
  Zap,
  BookOpen,
} from 'lucide-react'
import { AppLogo } from '@/components/AppLogo'

const WORKFLOW_STEPS = [
  {
    icon: Plus,
    title: 'Create a Project',
    description: 'Organize your assessments by creating projects for each software product or component.',
    action: 'Go to Dashboard',
    route: '/dashboard',
  },
  {
    icon: Upload,
    title: 'Import an SBOM',
    description: 'Upload CycloneDX or SPDX SBOMs to scan your software components against NVD, KEV, and EPSS.',
    action: 'Import SBOM',
    route: '/dashboard',
  },
  {
    icon: Search,
    title: 'Search Vulnerabilities',
    description: 'Query the NVD database directly by CVE ID, keyword, or CPE to find known vulnerabilities.',
    action: 'Open Search',
    route: '/search',
  },
  {
    icon: BarChart3,
    title: 'View Reports',
    description: 'Generate VEX documents, attack graphs, CVSS reports, and executive dashboards.',
    action: 'Executive Dashboard',
    route: '/executive',
  },
]

const TIPS = [
  {
    icon: Zap,
    title: 'Quick Tip: CPE Matching',
    description:
      'D-Fence automatically estimates CPEs for components without them. Review and confirm suggested matches for accurate vulnerability scanning.',
  },
  {
    icon: BookOpen,
    title: 'Quick Tip: SBOM Formats',
    description:
      'Both CycloneDX (JSON/XML) and SPDX (JSON) formats are supported. Excel-based SBOMs can also be generated and imported.',
  },
  {
    icon: Shield,
    title: 'Quick Tip: False Positive Filters',
    description:
      'Use the False Positive Filter (FPF) system to suppress known non-issues, keeping your vulnerability reports clean and actionable.',
  },
]

export function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <AppLogo size="md" showText={true} />
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
            >
              Go to Dashboard
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="px-6 py-16 text-center border-b border-border">
          <div className="mx-auto max-w-3xl">
            <AppLogo size="lg" showText={false} className="justify-center mb-6" />
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">D-Fence</h1>
            <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
              Vulnerability assessment made simple. Scan SBOMs against NVD, KEV, and EPSS databases. Generate VEX
              documents, attack graphs, and CVSS reports.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="rounded-lg bg-primary px-6 py-3 text-primary-foreground font-medium hover:bg-primary/90 flex items-center gap-2"
              >
                <Plus className="h-5 w-5" />
                Get Started
              </button>
              <button
                onClick={() => navigate('/search')}
                className="rounded-lg border border-border bg-background px-6 py-3 font-medium hover:bg-muted flex items-center gap-2"
              >
                <Search className="h-5 w-5" />
                Search CVEs
              </button>
            </div>
          </div>
        </section>

        <section className="px-6 py-12">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-2xl font-bold text-center mb-2">How to Use D-Fence</h2>
            <p className="text-center text-muted-foreground mb-8">
              Follow these steps to assess your software for vulnerabilities
            </p>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {WORKFLOW_STEPS.map((step, index) => (
                <button
                  key={step.title}
                  onClick={() => navigate(step.route)}
                  className="group text-left rounded-lg border border-border bg-card p-6 hover:border-primary/50 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                      {index + 1}
                    </div>
                    <step.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground mb-3">{step.description}</p>
                  <span className="text-xs text-primary font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                    {step.action}
                    <ChevronRight className="h-3 w-3" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-12 bg-muted/30 border-t border-border">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-2xl font-bold text-center mb-8">Tips &amp; Tricks</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {TIPS.map((tip) => (
                <div key={tip.title} className="rounded-lg border border-border bg-card p-6">
                  <tip.icon className="h-6 w-6 text-primary mb-3" />
                  <h3 className="font-semibold mb-2">{tip.title}</h3>
                  <p className="text-sm text-muted-foreground">{tip.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-12 text-center border-t border-border">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-2xl font-bold mb-4">Ready to Secure Your Software?</h2>
            <p className="text-muted-foreground mb-6">
              Start by creating a project and importing your SBOM to discover known vulnerabilities.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="rounded-lg bg-primary px-6 py-3 text-primary-foreground font-medium hover:bg-primary/90 flex items-center gap-2"
              >
                <FileText className="h-5 w-5" />
                Open Dashboard
              </button>
              <button
                onClick={() => navigate('/settings')}
                className="rounded-lg border border-border bg-background px-6 py-3 font-medium hover:bg-muted"
              >
                Configure Settings
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-6 py-4 text-center text-sm text-muted-foreground">
        D-Fence v2.0.0 &mdash; Vulnerability Assessment Tool
      </footer>
    </div>
  )
}
