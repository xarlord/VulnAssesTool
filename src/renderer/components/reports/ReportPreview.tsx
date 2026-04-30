/**
 * ReportPreview Modal Component
 *
 * Preview reports before exporting with options to download as PDF or HTML.
 *
 * @module components/reports/ReportPreview
 */

import React, { useState, useMemo, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileText, FileImage, Settings, Eye, Loader2, Upload, X } from 'lucide-react'
import { ReportGenerator, previewHTML, downloadReport } from '@/lib/services/reports'
import type { ReportOptions, ReportData } from '@/lib/services/reports/types'

interface ReportPreviewProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog should close */
  onOpenChange: (open: boolean) => void
  /** Report data to preview */
  data: ReportData | null
  /** Project name for default title */
  projectName?: string
}

export function ReportPreview({ open, onOpenChange, data, projectName = 'Project' }: ReportPreviewProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeTab, setActiveTab] = useState<'preview' | 'options'>('preview')
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  // Report options state
  const [options, setOptions] = useState<ReportOptions>({
    title: `${projectName} - Vulnerability Assessment Report`,
    projectName,
    includeExecutiveSummary: true,
    includeCharts: true,
    includeRecommendations: true,
    theme: 'light',
  })

  // Generate preview HTML
  const previewHtml = useMemo(() => {
    if (!data) return ''
    try {
      return previewHTML(data, options)
    } catch (error) {
      console.error('[ReportPreview] Error generating preview:', error)
      return '<p>Error generating preview</p>'
    }
  }, [data, options])

  // Handle option changes
  const handleOptionChange = useCallback((key: keyof ReportOptions, value: unknown) => {
    setOptions((prev) => ({ ...prev, [key]: value }))
  }, [])

  // Handle logo upload
  const handleLogoUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      // Validate file type
      if (!file.type.startsWith('image/')) {
        console.error('[ReportPreview] Invalid file type for logo')
        return
      }

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        console.error('[ReportPreview] Logo file too large (max 2MB)')
        return
      }

      // Convert to base64
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64 = e.target?.result as string
        setLogoPreview(base64)
        handleOptionChange('companyLogo', base64)
      }
      reader.readAsDataURL(file)
    },
    [handleOptionChange],
  )

  // Handle logo removal
  const handleLogoRemove = useCallback(() => {
    setLogoPreview(null)
    handleOptionChange('companyLogo', undefined)
  }, [handleOptionChange])

  // Generate and download PDF
  const handleDownloadPDF = useCallback(async () => {
    if (!data) return

    setIsGenerating(true)
    try {
      const report = await ReportGenerator.generatePDF(data, options)
      downloadReport(report)
    } catch (error) {
      console.error('[ReportPreview] Error generating PDF:', error)
    } finally {
      setIsGenerating(false)
    }
  }, [data, options])

  // Generate and download HTML
  const handleDownloadHTML = useCallback(async () => {
    if (!data) return

    setIsGenerating(true)
    try {
      const report = await ReportGenerator.generateHTML(data, options)
      downloadReport(report)
    } catch (error) {
      console.error('[ReportPreview] Error generating HTML:', error)
    } finally {
      setIsGenerating(false)
    }
  }, [data, options])

  // Calculate quick stats for header
  const quickStats = useMemo(() => {
    if (!data) return null
    const { statistics } = data
    return {
      total: statistics.totalVulnerabilities,
      critical: statistics.criticalCount,
      high: statistics.highCount,
    }
  }, [data])

  if (!data) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <div className="py-8 text-center text-muted-foreground">No data available for report preview</div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Report Preview
            </DialogTitle>
            {quickStats && (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline">{quickStats.total} total</Badge>
                {quickStats.critical > 0 && <Badge variant="destructive">{quickStats.critical} critical</Badge>}
                {quickStats.high > 0 && <Badge className="bg-orange-500">{quickStats.high} high</Badge>}
              </div>
            )}
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'preview' | 'options')}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="options" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Options
            </TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="flex-1 min-h-0 mt-4">
            <ScrollArea className="h-[60vh] rounded-md border">
              <iframe srcDoc={previewHtml} className="w-full h-full min-h-[60vh] border-0" title="Report Preview" />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="options" className="flex-1 mt-4">
            <ScrollArea className="h-[60vh]">
              <div className="space-y-6 pr-4">
                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title">Report Title</Label>
                  <Input
                    id="title"
                    value={options.title}
                    onChange={(e) => handleOptionChange('title', e.target.value)}
                    placeholder="Enter report title"
                  />
                </div>

                {/* Theme */}
                <div className="space-y-2">
                  <Label htmlFor="theme">Theme</Label>
                  <Select value={options.theme} onValueChange={(v) => handleOptionChange('theme', v)}>
                    <SelectTrigger id="theme">
                      <SelectValue placeholder="Select theme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Toggles */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Executive Summary</Label>
                      <p className="text-xs text-muted-foreground">Include risk score and key findings</p>
                    </div>
                    <Switch
                      checked={options.includeExecutiveSummary}
                      onCheckedChange={(v) => handleOptionChange('includeExecutiveSummary', v)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Charts & Visualizations</Label>
                      <p className="text-xs text-muted-foreground">Include severity distribution chart</p>
                    </div>
                    <Switch
                      checked={options.includeCharts}
                      onCheckedChange={(v) => handleOptionChange('includeCharts', v)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Recommendations</Label>
                      <p className="text-xs text-muted-foreground">Include remediation recommendations</p>
                    </div>
                    <Switch
                      checked={options.includeRecommendations}
                      onCheckedChange={(v) => handleOptionChange('includeRecommendations', v)}
                    />
                  </div>
                </div>

                {/* Company branding */}
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name (optional)</Label>
                  <Input
                    id="companyName"
                    value={options.companyName || ''}
                    onChange={(e) => handleOptionChange('companyName', e.target.value)}
                    placeholder="Enter company name for footer"
                  />
                </div>

                {/* Company Logo Upload */}
                <div className="space-y-2">
                  <Label>Company Logo (optional)</Label>
                  <div className="flex items-start gap-4">
                    {logoPreview || options.companyLogo ? (
                      <div className="relative group">
                        <img
                          src={logoPreview || options.companyLogo}
                          alt="Company logo"
                          className="h-16 w-16 object-contain rounded border"
                        />
                        <button
                          type="button"
                          onClick={handleLogoRemove}
                          aria-label="Remove logo"
                          className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center h-16 w-full border-2 border-dashed rounded-md cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors">
                        <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                        <span className="text-xs text-muted-foreground">Upload Logo</span>
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      </label>
                    )}
                    <div className="flex-1 text-xs text-muted-foreground">
                      <p>Upload a company logo to include in the report header.</p>
                      <p className="mt-1">Supported formats: PNG, JPG, SVG. Max size: 2MB</p>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleDownloadHTML}
            disabled={isGenerating}
            className="flex items-center gap-2"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            HTML
          </Button>
          <Button onClick={handleDownloadPDF} disabled={isGenerating} className="flex items-center gap-2">
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileImage className="h-4 w-4" />}
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ReportPreview
