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
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

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
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <AppLogo size="md" showText={true} />
          <Button variant="default" size="default" onClick={() => navigate('/dashboard')} className="gap-2">
            Go to Dashboard
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden px-6 pb-20 pt-24">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-primary/[0.02] to-transparent" />
          <div className="relative mx-auto max-w-3xl text-center">
            <div className="mb-8 flex justify-center">
              <div className="rounded-2xl bg-primary/10 p-4">
                <AppLogo size="lg" showText={false} />
              </div>
            </div>
            <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-6xl">D-Fence</h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Vulnerability assessment made simple. Scan SBOMs against NVD, KEV, and EPSS databases. Generate VEX
              documents, attack graphs, and CVSS reports.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Button size="lg" onClick={() => navigate('/dashboard')} className="gap-2">
                <Plus className="h-5 w-5" />
                Get Started
              </Button>
              <Button variant="outline" size="lg" onClick={() => navigate('/search')} className="gap-2">
                <Search className="h-5 w-5" />
                Search CVEs
              </Button>
            </div>
          </div>
        </section>

        <section className="px-6 pb-20">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tight">How It Works</h2>
              <p className="mt-3 text-muted-foreground">Four steps to assess your software for vulnerabilities</p>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {WORKFLOW_STEPS.map((step, index) => (
                <button key={step.title} type="button" onClick={() => navigate(step.route)} className="group text-left">
                  <Card className="h-full transition-all duration-200 hover:border-primary/40 hover:shadow-md">
                    <CardHeader>
                      <div className="mb-2 flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-sm">
                          {index + 1}
                        </span>
                        <step.icon className="h-5 w-5 text-primary" />
                      </div>
                      <CardTitle className="text-base">{step.title}</CardTitle>
                      <CardDescription className="min-h-[3rem]">{step.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-all group-hover:gap-2">
                        {step.action}
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-muted/30 px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tight">Tips &amp; Tricks</h2>
              <p className="mt-3 text-muted-foreground">Get the most out of D-Fence with these helpful pointers</p>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {TIPS.map((tip) => (
                <Card key={tip.title} className="transition-shadow duration-200 hover:shadow-md">
                  <CardHeader>
                    <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <tip.icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="mt-3 text-base">{tip.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="leading-relaxed">{tip.description}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Shield className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight">Ready to Secure Your Software?</h2>
            <p className="mt-4 text-muted-foreground">
              Start by creating a project and importing your SBOM to discover known vulnerabilities.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Button size="lg" onClick={() => navigate('/dashboard')} className="gap-2">
                <FileText className="h-5 w-5" />
                Open Dashboard
              </Button>
              <Button variant="outline" size="lg" onClick={() => navigate('/settings')}>
                Configure Settings
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-6 py-5">
        <div className="mx-auto max-w-6xl text-center text-sm text-muted-foreground">
          D-Fence v2.0.0 &mdash; Vulnerability Assessment Tool
        </div>
      </footer>
    </div>
  )
}
