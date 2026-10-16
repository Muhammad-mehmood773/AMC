import type { AssetStatus, Criticality, SerialUniquenessScope } from '../models/asset.model';

/**
 * Configurable business rules of the Asset / Installed Base module (SRS 3.16). Adjust per
 * tenant policy; the mock adapters and forms read these values.
 */
export const ASSET_RULES = {
  /** Asset Tag must be unique (organizational policy). */
  uniqueTag: true,
  /** Default serial-number uniqueness scope. */
  serialScope: 'type-manufacturer' as SerialUniquenessScope,
  /** Asset types exempt from serial uniqueness (e.g. bulk sensors without serials). */
  serialExemptTypes: ['Sensor'] as readonly string[],
  /** Warranties ending within this window are "Expiring Soon". */
  warrantyExpiringDays: 60,
  /** Agreements ending within this window are "Expiring". */
  contractExpiringDays: 60,
  /** Maintenance due within this window counts as "Due for Preventive Maintenance". */
  pmDueWindowDays: 30,
  /** Failures within the window used to detect repeated failures. */
  repeatedFailureWindowDays: 180,
  repeatedFailureThreshold: 3,
} as const;

/** Statuses that block new service transactions (SR, WO, maintenance, transfer, components). */
export const TRANSACTION_BLOCKED_STATUSES: readonly AssetStatus[] = ['Retired', 'Decommissioned'];

/** Statuses that require an associated service site when a customer is set (SRS 3.16). */
export const SITE_REQUIRED_STATUSES: readonly AssetStatus[] = [
  'Installed',
  'Active',
  'Under Maintenance',
  'Under Repair',
  'Temporarily Out of Service',
];

/** Allowed manual status transitions; system workflows (installation, transfer) set others. */
export const STATUS_TRANSITIONS: Readonly<Record<AssetStatus, readonly AssetStatus[]>> = {
  Planned: ['Ordered', 'Received', 'Retired'],
  Ordered: ['Received', 'Planned', 'Retired'],
  Received: ['Installed', 'Retired'],
  Installed: ['Active', 'Under Maintenance', 'Under Repair', 'Temporarily Out of Service', 'Retired'],
  Active: ['Under Maintenance', 'Under Repair', 'Temporarily Out of Service', 'Retired'],
  'Under Maintenance': ['Active', 'Under Repair', 'Temporarily Out of Service', 'Retired'],
  'Under Repair': ['Active', 'Under Maintenance', 'Temporarily Out of Service', 'Retired'],
  'Temporarily Out of Service': ['Active', 'Under Maintenance', 'Under Repair', 'Retired'],
  Transferred: ['Active'],
  Retired: ['Decommissioned', 'Active'],
  Decommissioned: [],
};

export interface CriticalityProfile {
  readonly sla: string;
  readonly responseTime: string;
  readonly pmFrequency: string;
  readonly escalation: string;
  readonly technicianPriority: string;
  readonly sparesPlanning: string;
  readonly scheduling: string;
}

/** SRS 3.17 — how criticality influences downstream service behaviour. */
export const CRITICALITY_PROFILE: Readonly<Record<Criticality, CriticalityProfile>> = {
  Critical: {
    sla: 'Platinum 24/7',
    responseTime: '2 hours',
    pmFrequency: 'Monthly',
    escalation: 'Immediate escalation to service manager',
    technicianPriority: 'P1 — senior certified technician',
    sparesPlanning: 'Critical spares held on site',
    scheduling: 'Any time, including after hours',
  },
  High: {
    sla: 'Gold',
    responseTime: '4 hours',
    pmFrequency: 'Quarterly',
    escalation: 'Escalate after 4 hours',
    technicianPriority: 'P2 — certified technician',
    sparesPlanning: 'Spares in regional store',
    scheduling: 'Extended hours',
  },
  Medium: {
    sla: 'Silver',
    responseTime: '8 hours',
    pmFrequency: 'Semi-Annual',
    escalation: 'Escalate after 1 business day',
    technicianPriority: 'P3 — standard technician',
    sparesPlanning: 'Order on demand',
    scheduling: 'Business hours',
  },
  Low: {
    sla: 'Bronze',
    responseTime: '24 hours',
    pmFrequency: 'Annual',
    escalation: 'Standard follow-up',
    technicianPriority: 'P4 — next available',
    sparesPlanning: 'Order on demand',
    scheduling: 'Planned visit window',
  },
};

export interface TechnicalField {
  readonly key: 'capacity' | 'powerRating' | 'voltage' | 'frequency' | 'dimensions' | 'weight' | 'operatingRange' | 'fuelType' | 'refrigerantType';
  readonly label: string;
  readonly placeholder: string;
}

export const TECHNICAL_FIELDS: readonly TechnicalField[] = [
  { key: 'capacity', label: 'Capacity', placeholder: 'e.g. 400 TR, 600 kVA, 1,000 kg' },
  { key: 'powerRating', label: 'Power Rating', placeholder: 'e.g. 250 kW' },
  { key: 'voltage', label: 'Voltage', placeholder: 'e.g. 400 V 3-phase' },
  { key: 'frequency', label: 'Frequency', placeholder: 'e.g. 60 Hz' },
  { key: 'dimensions', label: 'Dimensions', placeholder: 'L × W × H (mm)' },
  { key: 'weight', label: 'Weight', placeholder: 'e.g. 3,200 kg' },
  { key: 'operatingRange', label: 'Operating Range', placeholder: 'e.g. 5–45 °C ambient' },
  { key: 'fuelType', label: 'Fuel Type', placeholder: '' },
  { key: 'refrigerantType', label: 'Refrigerant Type', placeholder: '' },
];

export interface CategoryProfile {
  /** Technical fields relevant for the category (others are hidden). */
  readonly technical: readonly TechnicalField['key'][];
  /** Category-specific custom attributes. */
  readonly attributes: readonly { readonly key: string; readonly label: string; readonly placeholder?: string }[];
}

const ALL_TECHNICAL = TECHNICAL_FIELDS.map((f) => f.key);

/**
 * Technical information and custom attributes configured by asset category (SRS 3.5 E).
 * Unknown / new categories show every standard technical field and no custom attributes.
 */
export const CATEGORY_PROFILES: Readonly<Record<string, CategoryProfile>> = {
  HVAC: {
    technical: ['capacity', 'powerRating', 'voltage', 'frequency', 'dimensions', 'weight', 'operatingRange', 'refrigerantType'],
    attributes: [
      { key: 'coolingCapacityTr', label: 'Cooling Capacity (TR)', placeholder: 'e.g. 400' },
      { key: 'refrigerantCharge', label: 'Refrigerant Charge (kg)', placeholder: 'e.g. 180' },
      { key: 'efficiency', label: 'Efficiency (kW/TR or SEER)', placeholder: 'e.g. 0.56 kW/TR' },
      { key: 'airflow', label: 'Airflow (CFM)', placeholder: 'e.g. 12,000' },
    ],
  },
  Power: {
    technical: ['capacity', 'powerRating', 'voltage', 'frequency', 'dimensions', 'weight', 'fuelType'],
    attributes: [
      { key: 'ratedKva', label: 'Rated Output (kVA)', placeholder: 'e.g. 600' },
      { key: 'fuelTankLitres', label: 'Fuel Tank (litres)', placeholder: 'e.g. 1,000' },
      { key: 'batteryAutonomy', label: 'Battery Autonomy (min)', placeholder: 'e.g. 15' },
      { key: 'atsModel', label: 'ATS / Transfer Switch', placeholder: 'e.g. ASCO 7000' },
    ],
  },
  'Vertical Transport': {
    technical: ['capacity', 'powerRating', 'voltage', 'dimensions'],
    attributes: [
      { key: 'ratedLoadKg', label: 'Rated Load (kg)', placeholder: 'e.g. 1,000' },
      { key: 'speed', label: 'Speed (m/s)', placeholder: 'e.g. 1.6' },
      { key: 'floorsServed', label: 'Floors / Stops Served', placeholder: 'e.g. B2–18' },
      { key: 'driveType', label: 'Drive Type', placeholder: 'e.g. Gearless traction' },
    ],
  },
  'Fire & Safety': {
    technical: ['powerRating', 'voltage', 'dimensions'],
    attributes: [
      { key: 'zones', label: 'Zones / Loops', placeholder: 'e.g. 8 loops' },
      { key: 'devices', label: 'Connected Devices', placeholder: 'e.g. 420 detectors' },
      { key: 'standard', label: 'Compliance Standard', placeholder: 'e.g. NFPA 72' },
      { key: 'civilDefenseRef', label: 'Civil Defense Approval Ref.' },
    ],
  },
  Security: {
    technical: ['powerRating', 'voltage', 'dimensions'],
    attributes: [
      { key: 'channels', label: 'Channels / Cameras', placeholder: 'e.g. 128' },
      { key: 'storageTb', label: 'Storage (TB)', placeholder: 'e.g. 96' },
      { key: 'retentionDays', label: 'Retention (days)', placeholder: 'e.g. 90' },
      { key: 'firmware', label: 'Firmware Version' },
    ],
  },
  Plumbing: {
    technical: ['capacity', 'powerRating', 'voltage', 'frequency', 'dimensions', 'operatingRange'],
    attributes: [
      { key: 'flowRate', label: 'Flow Rate (m³/h)', placeholder: 'e.g. 45' },
      { key: 'head', label: 'Head (m)', placeholder: 'e.g. 60' },
      { key: 'pumps', label: 'Number of Pumps', placeholder: 'e.g. 3 (2 duty + 1 standby)' },
    ],
  },
  'Building Automation': {
    technical: ['powerRating', 'voltage'],
    attributes: [
      { key: 'protocol', label: 'Protocol', placeholder: 'e.g. BACnet/IP' },
      { key: 'points', label: 'I/O Points', placeholder: 'e.g. 256' },
      { key: 'firmware', label: 'Firmware Version' },
    ],
  },
  Refrigeration: {
    technical: ['capacity', 'powerRating', 'voltage', 'frequency', 'operatingRange', 'refrigerantType'],
    attributes: [
      { key: 'setPoint', label: 'Set Point (°C)', placeholder: 'e.g. -18' },
      { key: 'refrigerantCharge', label: 'Refrigerant Charge (kg)' },
      { key: 'roomVolume', label: 'Room Volume (m³)' },
    ],
  },
  'Medical Equipment': {
    technical: ['powerRating', 'voltage', 'frequency', 'dimensions', 'weight'],
    attributes: [
      { key: 'regulatoryClass', label: 'Regulatory Class', placeholder: 'e.g. Class IIb' },
      { key: 'sfdaRef', label: 'Regulatory Registration No.' },
      { key: 'calibrationInterval', label: 'Calibration Interval', placeholder: 'e.g. 12 months' },
    ],
  },
  'IT & Network': {
    technical: ['powerRating', 'voltage', 'dimensions'],
    attributes: [
      { key: 'ports', label: 'Ports', placeholder: 'e.g. 48 × 1G + 4 × 10G' },
      { key: 'ipAddress', label: 'Management IP' },
      { key: 'firmware', label: 'Firmware Version' },
    ],
  },
};

export function categoryProfile(category: string): CategoryProfile {
  return CATEGORY_PROFILES[category] ?? { technical: ALL_TECHNICAL, attributes: [] };
}
