/**
 * ConfigWizard - Multi-step configuration wizard for FPF
 *
 * Steps:
 * 1. Project Information (name, version, tier)
 * 2. Interface Configuration (enable/disable interfaces)
 * 3. Service Configuration (external access settings)
 * 4. Feature Flags (enabled features)
 * 5. Review & Save
 */

import React, { useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Check, X, HelpCircle, Save, AlertCircle } from 'lucide-react'
import type {
  SystemConfig,
  ProjectConfig,
  ProjectTier,
  InterfaceConfig,
  ServiceConfig,
  FeatureConfig,
  CybersecurityConfig,
  AttackSurface,
  ExposureLevel,
} from '@@/types/fpf'

// ============================================================================
// Types
// ============================================================================

export interface ConfigWizardProps {
  /** Existing configuration to edit (if any) */
  initialConfig?: SystemConfig | null

  /** Callback when configuration is saved */
  onSave: (config: SystemConfig) => void

  /** Callback when wizard is cancelled */
  onCancel: () => void

  /** Whether save is in progress */
  isSaving?: boolean

  /** Available interfaces to configure */
  availableInterfaces?: string[]

  /** Available services to configure */
  availableServices?: string[]

  /** Available features to configure */
  availableFeatures?: string[]

  /** Additional class name */
  className?: string
}

interface StepConfig {
  id: number
  title: string
  description: string
  isComplete: (config: Partial<SystemConfig>) => boolean
}

const STEPS: StepConfig[] = [
  {
    id: 1,
    title: 'Project Information',
    description: 'Basic project details and tier selection',
    isComplete: (config) => !!config.project?.name && !!config.project?.tier,
  },
  {
    id: 2,
    title: 'Interface Configuration',
    description: 'Enable or disable network interfaces',
    isComplete: () => true, // Optional step
  },
  {
    id: 3,
    title: 'Service Configuration',
    description: 'Configure external service access',
    isComplete: () => true, // Optional step
  },
  {
    id: 4,
    title: 'Feature Flags',
    description: 'Enable or disable application features',
    isComplete: () => true, // Optional step
  },
  {
    id: 5,
    title: 'Review & Save',
    description: 'Review configuration before saving',
    isComplete: () => true,
  },
]

const DEFAULT_INTERFACES = ['wifi', 'bluetooth', 'ethernet', 'cellular', 'usb', 'can_bus', 'gps']

const DEFAULT_SERVICES = ['ota_updates', 'remote_diagnostics', 'cloud_sync', 'data_upload', 'external_api']

const DEFAULT_FEATURES = ['location_services', 'voice_assistant', 'third_party_apps', 'analytics', 'crash_reporting']

// ============================================================================
// Helper Components
// ============================================================================

function StepIndicator({
  steps,
  currentStep,
  config,
}: {
  steps: StepConfig[]
  currentStep: number
  config: Partial<SystemConfig>
}) {
  return (
    <div className="flex items-center justify-between" data-testid="step-indicator">
      {steps.map((step, index) => {
        const isActive = currentStep === step.id
        const isComplete = step.isComplete(config) && currentStep > step.id
        const isPast = currentStep > step.id

        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : isComplete || isPast
                      ? 'border-green-500 bg-green-500 text-white'
                      : 'border-border text-muted-foreground'
                }`}
                data-testid={`step-${step.id}-indicator`}
              >
                {isComplete || isPast ? <Check className="h-5 w-5" /> : <span>{step.id}</span>}
              </div>
              <p className={`mt-2 text-xs font-medium ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                {step.title}
              </p>
            </div>
            {index < steps.length - 1 && (
              <div className={`mb-6 h-0.5 flex-1 ${isPast ? 'bg-green-500' : 'bg-border'}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function FormField({
  label,
  helpText,
  children,
  required,
}: {
  label: string
  helpText?: string
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <label className="text-sm font-medium">{label}</label>
        {required && <span className="text-red-500">*</span>}
        {helpText && (
          <span title={helpText} className="cursor-help">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-muted'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      {label && <span className="text-sm">{label}</span>}
    </label>
  )
}

// ============================================================================
// Step Components
// ============================================================================

function Step1ProjectInfo({
  config,
  onChange,
}: {
  config: Partial<SystemConfig>
  onChange: (updates: Partial<SystemConfig>) => void
}) {
  const project = config.project || {}

  const handleChange = (field: keyof ProjectConfig, value: string) => {
    onChange({
      ...config,
      project: { ...project, [field]: value } as ProjectConfig,
    })
  }

  return (
    <div className="space-y-6" data-testid="step-1-content">
      <FormField label="Project Name" required helpText="The name of your project">
        <input
          type="text"
          value={project.name || ''}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="My Application"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          data-testid="project-name-input"
        />
      </FormField>

      <FormField label="Version" helpText="Current project version">
        <input
          type="text"
          value={project.version || ''}
          onChange={(e) => handleChange('version', e.target.value)}
          placeholder="1.0.0"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          data-testid="project-version-input"
        />
      </FormField>

      <FormField
        label="Project Tier"
        required
        helpText="Tier affects filter strictness: prototype (lenient), development (balanced), production (strict)"
      >
        <div className="grid grid-cols-3 gap-3">
          {(['prototype', 'development', 'production'] as ProjectTier[]).map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => handleChange('tier', tier)}
              className={`rounded-lg border-2 p-4 text-center transition-colors ${
                project.tier === tier ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground'
              }`}
              data-testid={`tier-${tier}`}
            >
              <p className="font-medium capitalize">{tier}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {tier === 'prototype' && 'Lenient filtering'}
                {tier === 'development' && 'Balanced filtering'}
                {tier === 'production' && 'Strict filtering'}
              </p>
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="Attack Surface" helpText="ISO 21434 attack surface classification">
        <div className="grid grid-cols-3 gap-3">
          {(['low', 'intermediate', 'high'] as AttackSurface[]).map((surface) => (
            <button
              key={surface}
              type="button"
              onClick={() =>
                onChange({
                  ...config,
                  cybersecurity: {
                    ...(config.cybersecurity || {}),
                    attackSurface: surface,
                  } as CybersecurityConfig,
                })
              }
              className={`rounded-lg border-2 p-3 text-center transition-colors ${
                config.cybersecurity?.attackSurface === surface
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-muted-foreground'
              }`}
              data-testid={`attack-surface-${surface}`}
            >
              <p className="text-sm font-medium capitalize">{surface}</p>
            </button>
          ))}
        </div>
      </FormField>
    </div>
  )
}

function Step2Interfaces({
  config,
  onChange,
  availableInterfaces,
}: {
  config: Partial<SystemConfig>
  onChange: (updates: Partial<SystemConfig>) => void
  availableInterfaces: string[]
}) {
  const interfaces = config.interfaces || {}

  const handleToggle = (name: string, enabled: boolean) => {
    onChange({
      ...config,
      interfaces: {
        ...interfaces,
        [name]: {
          ...(interfaces[name] || { confidence: 100 }),
          enabled,
        } as InterfaceConfig,
      },
    })
  }

  const handleExposureChange = (name: string, exposure: ExposureLevel) => {
    onChange({
      ...config,
      interfaces: {
        ...interfaces,
        [name]: {
          ...(interfaces[name] || { confidence: 100, enabled: true }),
          exposure,
        } as InterfaceConfig,
      },
    })
  }

  return (
    <div className="space-y-4" data-testid="step-2-content">
      <p className="text-sm text-muted-foreground">
        Configure which network interfaces are enabled in your project. Disabled interfaces will filter vulnerabilities
        that require those interfaces.
      </p>

      <div className="space-y-3">
        {availableInterfaces.map((name) => {
          const iface = interfaces[name] || { enabled: true, confidence: 100 }
          const displayName = name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

          return (
            <div
              key={name}
              className="flex items-center justify-between rounded-lg border border-border p-4"
              data-testid={`interface-${name}`}
            >
              <div className="flex items-center gap-3">
                <ToggleSwitch checked={iface.enabled !== false} onChange={(enabled) => handleToggle(name, enabled)} />
                <span className="font-medium">{displayName}</span>
              </div>

              {iface.enabled !== false && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Exposure:</span>
                  <select
                    value={iface.exposure || 'internal'}
                    onChange={(e) => handleExposureChange(name, e.target.value as ExposureLevel)}
                    className="rounded border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="isolated">Isolated</option>
                    <option value="internal">Internal</option>
                    <option value="external">External</option>
                  </select>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Step3Services({
  config,
  onChange,
  availableServices,
}: {
  config: Partial<SystemConfig>
  onChange: (updates: Partial<SystemConfig>) => void
  availableServices: string[]
}) {
  const services = config.services || {}

  const handleToggle = (name: string, enabled: boolean) => {
    onChange({
      ...config,
      services: {
        ...services,
        [name]: {
          ...(services[name] || { confidence: 100, externalAccess: false }),
          enabled,
        } as ServiceConfig,
      },
    })
  }

  const handleExternalAccess = (name: string, externalAccess: boolean) => {
    onChange({
      ...config,
      services: {
        ...services,
        [name]: {
          ...(services[name] || { confidence: 100, enabled: true }),
          externalAccess,
        } as ServiceConfig,
      },
    })
  }

  return (
    <div className="space-y-4" data-testid="step-3-content">
      <p className="text-sm text-muted-foreground">
        Configure which services are available and whether they accept external connections.
      </p>

      <div className="space-y-3">
        {availableServices.map((name) => {
          const service = services[name] || { enabled: true, externalAccess: false, confidence: 100 }
          const displayName = name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

          return (
            <div key={name} className="rounded-lg border border-border p-4" data-testid={`service-${name}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ToggleSwitch
                    checked={service.enabled !== false}
                    onChange={(enabled) => handleToggle(name, enabled)}
                  />
                  <span className="font-medium">{displayName}</span>
                </div>
              </div>

              {service.enabled !== false && (
                <div className="mt-3 ml-14">
                  <ToggleSwitch
                    checked={service.externalAccess || false}
                    onChange={(external) => handleExternalAccess(name, external)}
                    label="Allow external access"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Step4Features({
  config,
  onChange,
  availableFeatures,
}: {
  config: Partial<SystemConfig>
  onChange: (updates: Partial<SystemConfig>) => void
  availableFeatures: string[]
}) {
  const features = config.features || {}

  const handleToggle = (name: string, enabled: boolean) => {
    onChange({
      ...config,
      features: {
        ...features,
        [name]: {
          ...(features[name] || { confidence: 100 }),
          enabled,
        } as FeatureConfig,
      },
    })
  }

  return (
    <div className="space-y-4" data-testid="step-4-content">
      <p className="text-sm text-muted-foreground">
        Enable or disable specific features. Vulnerabilities affecting disabled features may be filtered.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {availableFeatures.map((name) => {
          const feature = features[name] || { enabled: true, confidence: 100 }
          const displayName = name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

          return (
            <div
              key={name}
              className={`rounded-lg border p-4 transition-colors ${
                feature.enabled !== false ? 'border-border bg-card' : 'border-border bg-muted/30'
              }`}
              data-testid={`feature-${name}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{displayName}</span>
                <ToggleSwitch checked={feature.enabled !== false} onChange={(enabled) => handleToggle(name, enabled)} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Step5Review({
  config,
  onSave,
  isSaving,
}: {
  config: Partial<SystemConfig>
  onSave: () => void
  isSaving: boolean
}) {
  const enabledInterfaces = Object.entries(config.interfaces || {})
    .filter(([, cfg]) => cfg.enabled !== false)
    .map(([name]) => name)

  const disabledInterfaces = Object.entries(config.interfaces || {})
    .filter(([, cfg]) => cfg.enabled === false)
    .map(([name]) => name)

  const enabledServices = Object.entries(config.services || {})
    .filter(([, cfg]) => cfg.enabled !== false)
    .map(([name]) => name)

  const externalServices = Object.entries(config.services || {})
    .filter(([, cfg]) => cfg.externalAccess)
    .map(([name]) => name)

  const enabledFeatures = Object.entries(config.features || {})
    .filter(([, cfg]) => cfg.enabled !== false)
    .map(([name]) => name)

  const disabledFeatures = Object.entries(config.features || {})
    .filter(([, cfg]) => cfg.enabled === false)
    .map(([name]) => name)

  const hasErrors = !config.project?.name || !config.project?.tier

  return (
    <div className="space-y-6" data-testid="step-5-content">
      {hasErrors && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <div>
            <p className="text-sm font-medium text-red-500">Configuration Incomplete</p>
            <p className="text-xs text-red-500/80">Please complete the required fields before saving.</p>
          </div>
        </div>
      )}

      {/* Project Summary */}
      <div className="rounded-lg border border-border p-4">
        <h4 className="mb-3 font-medium">Project Information</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Name:</span>
            <span className="ml-2 font-medium">{config.project?.name || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Version:</span>
            <span className="ml-2">{config.project?.version || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Tier:</span>
            <span className="ml-2 capitalize">{config.project?.tier || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Attack Surface:</span>
            <span className="ml-2 capitalize">{config.cybersecurity?.attackSurface || '-'}</span>
          </div>
        </div>
      </div>

      {/* Interfaces Summary */}
      <div className="rounded-lg border border-border p-4">
        <h4 className="mb-3 font-medium">Interfaces</h4>
        <div className="space-y-2 text-sm">
          {enabledInterfaces.length > 0 && (
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              <span className="text-muted-foreground">Enabled:</span>
              <span>{enabledInterfaces.join(', ')}</span>
            </div>
          )}
          {disabledInterfaces.length > 0 && (
            <div className="flex items-center gap-2">
              <X className="h-4 w-4 text-red-500" />
              <span className="text-muted-foreground">Disabled:</span>
              <span>{disabledInterfaces.join(', ')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Services Summary */}
      <div className="rounded-lg border border-border p-4">
        <h4 className="mb-3 font-medium">Services</h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-500" />
            <span className="text-muted-foreground">Enabled:</span>
            <span>{enabledServices.length} services</span>
          </div>
          {externalServices.length > 0 && (
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <span className="text-muted-foreground">External access:</span>
              <span>{externalServices.join(', ')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Features Summary */}
      <div className="rounded-lg border border-border p-4">
        <h4 className="mb-3 font-medium">Features</h4>
        <div className="space-y-2 text-sm">
          {enabledFeatures.length > 0 && (
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              <span className="text-muted-foreground">Enabled:</span>
              <span>{enabledFeatures.length} features</span>
            </div>
          )}
          {disabledFeatures.length > 0 && (
            <div className="flex items-center gap-2">
              <X className="h-4 w-4 text-red-500" />
              <span className="text-muted-foreground">Disabled:</span>
              <span>{disabledFeatures.join(', ')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={onSave}
        disabled={isSaving || hasErrors}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="save-config-button"
      >
        {isSaving ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Saving...
          </>
        ) : (
          <>
            <Save className="h-4 w-4" />
            Save Configuration
          </>
        )}
      </button>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function ConfigWizard({
  initialConfig,
  onSave,
  onCancel,
  isSaving = false,
  availableInterfaces = DEFAULT_INTERFACES,
  availableServices = DEFAULT_SERVICES,
  availableFeatures = DEFAULT_FEATURES,
  className = '',
}: ConfigWizardProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [config, setConfig] = useState<Partial<SystemConfig>>(
    initialConfig || {
      project: { name: '', version: '', tier: 'development' },
      cybersecurity: { attackSurface: 'intermediate', safetyRelated: false },
      interfaces: {},
      services: {},
      features: {},
    },
  )

  const updateConfig = useCallback((updates: Partial<SystemConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }))
  }, [])

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSave = () => {
    onSave(config as SystemConfig)
  }

  const currentStepConfig = STEPS[currentStep - 1]

  return (
    <div className={`rounded-lg border border-border bg-card p-6 ${className}`} data-testid="config-wizard">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold">FPF Configuration Wizard</h2>
        <p className="text-sm text-muted-foreground">Configure the False Positive Filter for your project</p>
      </div>

      {/* Step Indicator */}
      <div className="mb-8">
        <StepIndicator steps={STEPS} currentStep={currentStep} config={config} />
      </div>

      {/* Step Content */}
      <div className="mb-6 min-h-[400px]">
        {currentStep === 1 && <Step1ProjectInfo config={config} onChange={updateConfig} />}
        {currentStep === 2 && (
          <Step2Interfaces config={config} onChange={updateConfig} availableInterfaces={availableInterfaces} />
        )}
        {currentStep === 3 && (
          <Step3Services config={config} onChange={updateConfig} availableServices={availableServices} />
        )}
        {currentStep === 4 && (
          <Step4Features config={config} onChange={updateConfig} availableFeatures={availableFeatures} />
        )}
        {currentStep === 5 && <Step5Review config={config} onSave={handleSave} isSaving={isSaving} />}
      </div>

      {/* Navigation */}
      {currentStep < 5 && (
        <div className="flex items-center justify-between border-t border-border pt-4">
          <button
            onClick={currentStep === 1 ? onCancel : handlePrev}
            className="flex items-center gap-2 rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
            data-testid={currentStep === 1 ? 'cancel-button' : 'prev-button'}
          >
            {currentStep === 1 ? (
              <>
                <X className="h-4 w-4" />
                Cancel
              </>
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                Previous
              </>
            )}
          </button>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Step {currentStep} of {STEPS.length}: {currentStepConfig.title}
          </div>

          <button
            onClick={handleNext}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            data-testid="next-button"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

export default ConfigWizard
