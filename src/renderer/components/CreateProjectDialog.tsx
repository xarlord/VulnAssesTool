import React, { useState } from 'react'
import { useStore } from '@/store/useStore'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface CreateProjectDialogProps {
  open: boolean
  onClose: () => void
}

export function CreateProjectDialog({ open, onClose }: CreateProjectDialogProps) {
  const addProject = useStore((s) => s.addProject)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      setError('Project name is required')
      return
    }

    if (name.trim().length < 3) {
      setError('Project name must be at least 3 characters')
      return
    }

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
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleCancel()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>Enter the details for your new vulnerability assessment project</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="project-name" className="text-sm font-medium">
              Project Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="project-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              placeholder="My Application"
              autoFocus
            />
          </div>

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
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          {error && <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">{error}</div>}

          <DialogFooter className="pt-2">
            <Button type="button" variant="secondary" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit">Create Project</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
