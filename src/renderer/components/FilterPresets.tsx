import React, { useState, useRef, useEffect } from 'react'
import { Save, FolderOpen, Trash2, ChevronDown, Check } from 'lucide-react'
import type { FilterPreset } from '@@/types'

interface FilterPresetsProps {
  presets: FilterPreset[]
  currentFilters: FilterPreset['filters']
  onSavePreset: (name: string, filters: FilterPreset['filters']) => void
  onLoadPreset: (presetId: string) => void
  onDeletePreset: (presetId: string) => void
  className?: string
}

export function FilterPresets({
  presets,
  currentFilters,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
  className = '',
}: FilterPresetsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [presetName, setPresetName] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSavePreset = (e: React.FormEvent) => {
    e.preventDefault()
    if (!presetName.trim()) return

    onSavePreset(presetName.trim(), currentFilters)
    setPresetName('')
    setShowSaveDialog(false)
  }

  const activePreset = presets.find((preset) => JSON.stringify(preset.filters) === JSON.stringify(currentFilters))

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80"
        aria-label="Filter presets"
      >
        <FolderOpen className="h-4 w-4" />
        Presets
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-border bg-card shadow-lg">
          {/* Header with save button */}
          <div className="flex items-center justify-between border-b border-border p-3">
            <span className="text-sm font-medium">Filter Presets</span>
            <button
              onClick={() => setShowSaveDialog(!showSaveDialog)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
            >
              <Save className="h-3.5 w-3.5" />
              Save Current
            </button>
          </div>

          {/* Save preset form */}
          {showSaveDialog && (
            <div className="border-b border-border p-3">
              <form onSubmit={handleSavePreset} className="space-y-2">
                <input
                  type="text"
                  placeholder="Preset name..."
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSaveDialog(false)
                      setPresetName('')
                    }}
                    className="rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!presetName.trim()}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Presets list */}
          <div className="max-h-80 overflow-y-auto p-2">
            {presets.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <FolderOpen className="mx-auto mb-2 h-8 w-8 opacity-50" />
                No saved presets
              </div>
            ) : (
              <div className="space-y-1">
                {presets.map((preset) => {
                  const isActive = activePreset?.id === preset.id
                  const filterCount = Object.values(preset.filters).filter(
                    (v) => v !== undefined && (Array.isArray(v) ? v.length > 0 : true),
                  ).length

                  return (
                    <div
                      key={preset.id}
                      className="group flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50 transition-colors"
                    >
                      <button
                        onClick={() => {
                          onLoadPreset(preset.id)
                          setIsOpen(false)
                        }}
                        className="flex-1 text-left"
                      >
                        <div className="flex items-center gap-2">
                          {isActive && <Check className="h-4 w-4 text-primary" />}
                          <span className={`text-sm font-medium ${isActive ? 'text-primary' : ''}`}>{preset.name}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {filterCount} filter{filterCount !== 1 ? 's' : ''}
                        </div>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`Delete preset "${preset.name}"?`)) {
                            onDeletePreset(preset.id)
                          }
                        }}
                        className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                        aria-label={`Delete preset ${preset.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface CvssRangeSliderProps {
  value: [number, number]
  onChange: (value: [number, number]) => void
  min?: number
  max?: number
  step?: number
  className?: string
}

export function CvssRangeSlider({
  value,
  onChange,
  min = 0,
  max = 10,
  step = 0.1,
  className = '',
}: CvssRangeSliderProps) {
  const [localMin, localMax] = value

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMin = parseFloat(e.target.value)
    if (newMin <= localMax) {
      onChange([newMin, localMax])
    }
  }

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMax = parseFloat(e.target.value)
    if (newMax >= localMin) {
      onChange([localMin, newMax])
    }
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between text-sm">
        <label className="font-medium">CVSS Score Range</label>
        <span className="text-muted-foreground">
          {localMin.toFixed(1)} - {localMax.toFixed(1)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={localMin}
          onChange={handleMinChange}
          className="flex-1 h-2 cursor-pointer rounded-lg appearance-none bg-secondary accent-primary"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={localMax}
          onChange={handleMaxChange}
          className="flex-1 h-2 cursor-pointer rounded-lg appearance-none bg-secondary accent-primary"
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>0.0</span>
        <span>5.0</span>
        <span>10.0</span>
      </div>
    </div>
  )
}

interface MultiSelectFilterProps {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (selected: string[]) => void
  className?: string
}

export function MultiSelectFilter({ label, options, selected, onChange, className = '' }: MultiSelectFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleToggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const handleSelectAll = () => {
    if (selected.length === options.length) {
      onChange([])
    } else {
      onChange(options.map((o) => o.value))
    }
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted/50 min-w-[180px]"
      >
        <span>{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {selected.length > 0 ? `${selected.length} selected` : 'All'}
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full z-50 mt-2 w-64 rounded-lg border border-border bg-card shadow-lg">
          <div className="border-b border-border p-2">
            <button
              onClick={handleSelectAll}
              className="w-full rounded-md px-2 py-1.5 text-left text-xs font-medium hover:bg-muted/50"
            >
              {selected.length === options.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto p-2">
            {options.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={() => handleToggle(option.value)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-ring"
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
