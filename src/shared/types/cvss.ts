/**
 * CVSS (Common Vulnerability Scoring System) Types
 * Based on CVSS v3.1 specification
 */

/**
 * CVSS v3.1 Attack Vector metrics
 */
export type CvssAttackVector = 'Network' | 'Adjacent' | 'Local' | 'Physical'

/**
 * CVSS v3.1 Attack Complexity metrics
 */
export type CvssAttackComplexity = 'Low' | 'High'

/**
 * CVSS v3.1 Privileges Required metrics
 */
export type CvssPrivilegesRequired = 'None' | 'Low' | 'High'

/**
 * CVSS v3.1 User Interaction metrics
 */
export type CvssUserInteraction = 'None' | 'Required'

/**
 * CVSS v3.1 Scope metrics
 */
export type CvssScope = 'Unchanged' | 'Changed'

/**
 * CVSS v3.1 Impact metrics
 */
export type CvssImpact = 'High' | 'Low' | 'None'

/**
 * CVSS v3.1 Metric values
 */
export interface CvssMetrics {
  attackVector: CvssAttackVector
  attackComplexity: CvssAttackComplexity
  privilegesRequired: CvssPrivilegesRequired
  userInteraction: CvssUserInteraction
  scope: CvssScope
  confidentialityImpact: CvssImpact
  integrityImpact: CvssImpact
  availabilityImpact: CvssImpact
}

/**
 * CVSS Scores
 */
export interface CvssScores {
  baseScore: number
  impactSubScore: number
  exploitabilitySubScore: number
  temporalScore?: number
  environmentalScore?: number
}

/**
 * CVSS Metric Explanation
 */
export interface CvssMetricExplanation {
  metric: string
  value: string
  description: string
  implications: string
  example: string
}

/**
 * Complete CVSS Breakdown
 */
export interface CvssBreakdown {
  vectorString: string
  version: '3.0' | '3.1'
  metrics: CvssMetrics
  scores: CvssScores
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none'
  explanations: CvssMetricExplanation[]
  temporalMetrics?: {
    exploitCodeMaturity?: 'Not Defined' | 'High' | 'Functional' | 'Proof-of-Concept' | 'Unproven'
    remediationLevel?: 'Not Defined' | 'Official Fix' | 'Temporary Fix' | 'Workaround' | 'Unavailable'
    reportConfidence?: 'Not Defined' | 'Confirmed' | 'Reasonable' | 'Unknown'
  }
  environmentalMetrics?: {
    confidentialtyRequirement?: 'Not Defined' | 'High' | 'Medium' | 'Low'
    integrityRequirement?: 'Not Defined' | 'High' | 'Medium' | 'Low'
    availabilityRequirement?: 'Not Defined' | 'High' | 'Medium' | 'Low'
    modifiedAttackVector?: CvssAttackVector
    modifiedAttackComplexity?: CvssAttackComplexity
    modifiedPrivilegesRequired?: CvssPrivilegesRequired
    modifiedUserInteraction?: CvssUserInteraction
    modifiedScope?: CvssScope
    modifiedConfidentialityImpact?: CvssImpact
    modifiedIntegrityImpact?: CvssImpact
    modifiedAvailabilityImpact?: CvssImpact
  }
}

/**
 * Metric weight for radar chart visualization
 */
export interface CvssMetricWeight {
  metric: keyof CvssMetrics
  label: string
  value: number
  max: number
  description: string
}
