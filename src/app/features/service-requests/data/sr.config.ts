import type { ClassificationRule, RoutingRule } from '../models/operations.model';
import type { HoldReason, Priority } from '../models/request.model';

/** Configurable service-request rules (SRS 9.8, 9.11, 9.12, 9.15, 9.16, 9.20–9.22, 9.31). */
export const SR_RULES = {
  /** Automatic classification, priority, SLA, coverage, routing and technician assignment on creation. */
  autoClassify: true,
  autoAssignTechnician: true,
  /** Duplicate detection window and similarity threshold. */
  duplicateWindowDays: 14,
  duplicateThreshold: 45,
  /** Reopen allowed within this many days of resolution / closure. */
  reopenWindowDays: 30,
  /** SLA risk threshold (% of target consumed). */
  atRiskPercent: 75,
  /** Escalate unassigned critical requests after this many minutes. */
  criticalUnassignedMinutes: 30,
  /** "No progress" when assigned but not started after this many hours. */
  noProgressHours: 24,
  /** "Excessive pending duration" after this many days on hold. */
  excessivePendingDays: 3,
  /** Closure reminder when resolved but not confirmed for this many days. */
  closureReminderDays: 3,
  /** Reopen count that triggers "Repeated reopening". */
  repeatedReopenCount: 2,
  /** Hold reasons that pause the SLA clock (approved pause reasons, SRS 9.21). */
  slaPauseReasons: ['Waiting for Customer', 'Waiting for Parts', 'Waiting for Approval', 'Waiting for Site Access', 'Waiting for Vendor'] as readonly HoldReason[],
  /** Closure requirements (SRS 9.16). */
  confirmationRequiredFor: ['Critical', 'High'] as readonly Priority[],
  confirmationRequiredForCovered: true,
  attachmentRequiredForTypes: ['Warranty Request'] as readonly string[],
  /** Supervisor roles allowed to merge duplicates and approve chargeable work. */
  supervisorRoles: ['Service Supervisor', 'Service Manager', 'Operations Director'] as readonly string[],
  /** Cost model for traceability (SRS 9.29). */
  labourRatePerHour: 180,
  travelCostPerVisit: 150,
  company: 'Gulf Facility Services',
} as const;

/** SRS 9.12 — category → team / skill routing. */
export const ROUTING_RULES: readonly RoutingRule[] = [
  { category: 'HVAC Services', team: 'HVAC Team', skill: 'HVAC Technician', method: 'Category-Based Assignment' },
  { category: 'Electrical Services', team: 'Electrical Team', skill: 'Electrician', method: 'Category-Based Assignment' },
  { category: 'Generator Services', team: 'Electrical Team', skill: 'Generator Technician', method: 'Skill-Based Assignment' },
  { category: 'Elevator Services', team: 'Mechanical Team', skill: 'Elevator Technician', method: 'Skill-Based Assignment' },
  { category: 'Fire & Safety Services', team: 'Fire & Safety Team', skill: 'Fire Systems Technician', method: 'Skill-Based Assignment' },
  { category: 'CCTV & Security Services', team: 'ELV & Security Team', skill: 'ELV Technician', method: 'Category-Based Assignment' },
  { category: 'IT Equipment Services', team: 'ELV & Security Team', skill: 'ELV Technician', method: 'Category-Based Assignment' },
  { category: 'Medical Equipment Services', team: 'Multi-Skill Team', skill: 'Biomedical Technician', method: 'Skill-Based Assignment' },
  { category: 'Plumbing Services', team: 'Mechanical Team', skill: 'Plumber', method: 'Category-Based Assignment' },
  { category: 'Solar Services', team: 'Electrical Team', skill: 'Electrician', method: 'Category-Based Assignment' },
  { category: 'Preventive Maintenance', team: 'Multi-Skill Team', skill: 'Multi-Skill Technician', method: 'Team-Based Assignment' },
  { category: 'Inspection & Compliance', team: 'Multi-Skill Team', skill: 'Multi-Skill Technician', method: 'Team-Based Assignment' },
  { category: 'Installation & Commissioning', team: 'Multi-Skill Team', skill: 'Multi-Skill Technician', method: 'Team-Based Assignment' },
];

export const TEAM_SKILLS: Readonly<Record<string, readonly string[]>> = {
  'HVAC Team': ['HVAC Technician', 'Multi-Skill Technician'],
  'Electrical Team': ['Electrician', 'Generator Technician'],
  'Mechanical Team': ['Elevator Technician', 'Plumber'],
  'Fire & Safety Team': ['Fire Systems Technician'],
  'ELV & Security Team': ['ELV Technician'],
  'Multi-Skill Team': ['Multi-Skill Technician', 'HVAC Technician', 'Electrician', 'Plumber', 'Biomedical Technician'],
};

/** Asset category → service category used when the request has an asset. */
export const ASSET_CATEGORY_SERVICE: Readonly<Record<string, string>> = {
  HVAC: 'HVAC Services', Refrigeration: 'HVAC Services', Power: 'Generator Services', 'Vertical Transport': 'Elevator Services', 'Fire & Safety': 'Fire & Safety Services', Security: 'CCTV & Security Services', Plumbing: 'Plumbing Services', 'Building Automation': 'Electrical Services',
};

/** SRS 9.8 — keyword classification rules (first match wins). */
export const CLASSIFICATION_RULES: readonly ClassificationRule[] = [
  { id: 'CR-01', keywords: ['entrap', 'stuck', 'trapped'], type: 'Incident / Breakdown', category: 'Elevator Services', subcategory: 'Passenger Entrapment', problemCategory: 'Safety', urgency: 'High', skill: 'Elevator Technician' },
  { id: 'CR-02', keywords: ['elevator', 'lift', 'escalator'], type: 'Repair Request', category: 'Elevator Services', subcategory: 'Lift Fault', problemCategory: 'Mechanical', urgency: 'Medium', skill: 'Elevator Technician' },
  { id: 'CR-03', keywords: ['fire', 'smoke', 'alarm panel', 'sprinkler'], type: 'Incident / Breakdown', category: 'Fire & Safety Services', subcategory: 'Fire Alarm Fault', problemCategory: 'Safety', urgency: 'High', skill: 'Fire Systems Technician' },
  { id: 'CR-04', keywords: ['not cooling', 'no cooling', 'chiller', 'ac ', 'a/c', 'air condition', 'hvac', 'ahu', 'fcu', 'temperature'], type: 'Incident / Breakdown', category: 'HVAC Services', subcategory: 'Cooling Failure', problemCategory: 'Mechanical', urgency: 'Medium', skill: 'HVAC Technician' },
  { id: 'CR-05', keywords: ['generator', 'genset', 'ats'], type: 'Repair Request', category: 'Generator Services', subcategory: 'Generator Fault', problemCategory: 'Electrical', urgency: 'Medium', skill: 'Generator Technician' },
  { id: 'CR-06', keywords: ['power', 'outage', 'trip', 'breaker', 'electrical', 'ups'], type: 'Incident / Breakdown', category: 'Electrical Services', subcategory: 'Power Failure', problemCategory: 'Electrical', urgency: 'High', skill: 'Electrician' },
  { id: 'CR-07', keywords: ['leak', 'water', 'pump', 'drain', 'pipe'], type: 'Repair Request', category: 'Plumbing Services', subcategory: 'Leak / Flow Issue', problemCategory: 'Plumbing', urgency: 'Medium', skill: 'Plumber' },
  { id: 'CR-08', keywords: ['cctv', 'camera', 'access control', 'security'], type: 'Repair Request', category: 'CCTV & Security Services', subcategory: 'Security System Fault', problemCategory: 'ELV', urgency: 'Medium', skill: 'ELV Technician' },
  { id: 'CR-09', keywords: ['install', 'commission', 'setup'], type: 'Installation / Commissioning', category: 'Installation & Commissioning', subcategory: 'New Installation', problemCategory: 'Project', urgency: 'Low', skill: 'Multi-Skill Technician' },
  { id: 'CR-10', keywords: ['inspect', 'inspection', 'audit', 'test'], type: 'Inspection Request', category: 'Inspection & Compliance', subcategory: 'Condition Inspection', problemCategory: 'Compliance', urgency: 'Low', skill: 'Multi-Skill Technician' },
  { id: 'CR-11', keywords: ['noise', 'vibration', 'noisy'], type: 'Maintenance Request', category: 'HVAC Services', subcategory: 'Abnormal Noise', problemCategory: 'Mechanical', urgency: 'Low', skill: 'HVAC Technician' },
  { id: 'CR-12', keywords: ['warranty'], type: 'Warranty Request', category: 'Installation & Commissioning', subcategory: 'Warranty Claim', problemCategory: 'Warranty', urgency: 'Medium', skill: 'Multi-Skill Technician' },
];

/** SRS 9.11 — urgency × impact matrix (score 1–9) with additional factors. */
export const PRIORITY_MATRIX: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  High: { High: 9, Medium: 7, Low: 5 },
  Medium: { High: 7, Medium: 5, Low: 3 },
  Low: { High: 5, Medium: 3, Low: 1 },
};

export const PRIORITY_BANDS: readonly [number, Priority][] = [[9, 'Critical'], [7, 'High'], [4, 'Medium'], [0, 'Low']];

export const SUBCATEGORIES: Readonly<Record<string, readonly string[]>> = {
  'HVAC Services': ['Cooling Failure', 'Heating Failure', 'Abnormal Noise', 'Water Leakage', 'Thermostat / Controls', 'Air Quality'],
  'Electrical Services': ['Power Failure', 'Lighting', 'Breaker Tripping', 'UPS Alarm', 'Socket / Wiring'],
  'Generator Services': ['Generator Fault', 'ATS Failure', 'Fuel System', 'Battery / Charger'],
  'Elevator Services': ['Passenger Entrapment', 'Lift Fault', 'Door Problem', 'Levelling Issue', 'Escalator Fault'],
  'Fire & Safety Services': ['Fire Alarm Fault', 'Sprinkler Leak', 'Extinguisher Service', 'Emergency Lighting'],
  'CCTV & Security Services': ['Security System Fault', 'Camera Offline', 'Access Control', 'Intercom'],
  'IT Equipment Services': ['Network', 'Hardware Fault'],
  'Medical Equipment Services': ['Equipment Fault', 'Calibration'],
  'Plumbing Services': ['Leak / Flow Issue', 'Pump Failure', 'Blockage', 'Water Heater'],
  'Solar Services': ['Inverter Fault', 'Panel Cleaning'],
  'Preventive Maintenance': ['Scheduled PPM'],
  'Inspection & Compliance': ['Condition Inspection', 'Statutory Inspection'],
  'Installation & Commissioning': ['New Installation', 'Commissioning', 'Warranty Claim'],
};
