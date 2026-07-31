import React, { useState } from 'react'
import { useStore } from '@/store/useStore'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ulid } from '@/lib/audit'

interface CreateProjectDialogProps {
  open: boolean
  onClose: () => void
}

export function CreateProjectDialog({ open, onClose }: CreateProjectDialogProps) {
  const addProject = useStore((s) => s.addProject)
  const projects = useStore((s) => s.projects)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

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

    const trimmedName = name.trim()
    if (projects.some((p) => p.name.trim().toLowerCase() === trimmedName.toLowerCase())) {
      setError('A project with this name already exists')
      return
    }

    // Create project
    const newProject = {
      id: ulid(),
      name: trimmedName,
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
    <Dialog open={open} onOpenChange={(next) => !next && handleCancel()}>
      <DialogContent className="max-w-md">
        {/* Header */}
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>Enter the details for your new vulnerability assessment project</DialogDescription>
        </DialogHeader>

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
      </DialogContent>
    </Dialog>
  )
}
