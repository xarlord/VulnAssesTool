import React, { useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '@/store/useStore'

interface CreateProjectDialogProps {
  open: boolean
  onClose: () => void
}

export default function CreateProjectDialog({ open, onClose }: CreateProjectDialogProps) {
  const addProject = useStore((s) => s.addProject)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!name.trim()) {
      setError('Project name is required')
      return
    }

    if (name.trim().length < 3) {
      setError('Project name must be at least 3 characters')
      return
    }

    // Create project
    const newProject = {
      id: `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: name.trim(),
      description: description.trim() || undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      sbomFiles: [],
      components: [],
      vulnerabilities: [],
      statistics: {
        totalVulnerabilities: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        none: 0,
        totalComponents: 0,
        vulnerableComponents: 0,
      },
    }

    addProject(newProject)

    // Reset form and close
    setName('')
    setDescription('')
    setError('')
    onClose()
  }

  const handleCancel = () => {
    setName('')
    setDescription('')
    setError('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={handleCancel} aria-hidden="true" />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="relative z-50 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg"
      >
        {/* Close Button */}
        <button
          onClick={handleCancel}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label="Close dialog"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="mb-4">
          <h2 id="dialog-title" className="text-lg font-semibold">
            Create New Project
          </h2>
          <p className="text-sm text-muted-foreground">
            Enter the details for your new vulnerability assessment project
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name Field */}
          <div className="space-y-2">
            <label htmlFor="project-name" className="text-sm font-medium">
              Project Name <span className="text-destructive">*</span>
            </label>
            <input
              id="project-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              placeholder="My Application"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              autoFocus
            />
          </div>

          {/* Description Field */}
          <div className="space-y-2">
            <label htmlFor="project-description" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of the project..."
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-none"
            />
          </div>

          {/* Error Message */}
          {error && <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">{error}</div>}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
