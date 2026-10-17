import type { Auditable, Identifiable } from '@shared/models/entity';

/** SRS 4.5 A */
export const SERVICE_TYPES = [
  'Preventive Maintenance',
  'Corrective Maintenance',
  'Breakdown Service',
  'Inspection',
  'Installation',
  'Commissioning',
  'Calibration',
  'Repair',
  'Replacement',
  'Emergency Service',
  'Remote Support',
  'Consultation',
  'Other',
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_STATUSES = ['Active', 'Inactive', 'Draft'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

/** SRS 4.5 C */
export const SERVICE_UNITS = ['Visit', 'Hour', 'Day', 'Job', 'Inspection', 'Item', 'Other'] as const;
export type ServiceUnit = (typeof SERVICE_UNITS)[number];

/** SRS 4.5 F */
export const BILLING_METHODS = ['Fixed Price', 'Time & Material', 'Per Visit', 'Per Hour', 'Per Unit', 'Contract Included', 'Non-Billable'] as const;
export type BillingMethod = (typeof BILLING_METHODS)[number];

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const SERVICE_HOURS = ['Business Hours', 'Extended Hours', 'After Hours', '24/7'] as const;
export const FREQUENCY_UNITS = ['Days', 'Weeks', 'Months', 'Years'] as const;
export type FrequencyUnit = (typeof FREQUENCY_UNITS)[number];

/** Types for which the maintenance section is relevant (SRS 4.5 D). */
export const MAINTENANCE_SERVICE_TYPES: readonly ServiceType[] = ['Preventive Maintenance', 'Inspection', 'Calibration'];

/** Seed values — maintained through the generic lookup mechanism. */
export const SERVICE_CLASSES = ['Standard', 'Premium', 'Critical Systems', 'Compliance', 'Ad-hoc'] as const;
export const TECHNICIAN_SKILLS = ['HVAC Technician', 'Electrical Technician', 'Generator Specialist', 'Elevator Technician', 'Fire Systems Technician', 'ELV / CCTV Technician', 'Plumber', 'Biomedical Engineer', 'IT Field Engineer', 'Solar Technician', 'General Technician'] as const;
export const CERTIFICATIONS = ['EPA 608', 'NFPA 72', 'NICET Level II', 'OSHA 30', 'Lift Inspector Licence', 'Electrical Licence (LV)', 'Biomedical Certification', 'None'] as const;
export const TEAMS = ['HVAC Team', 'Electrical Team', 'Mechanical Team', 'Fire & Safety Team', 'ELV & Security Team', 'Biomedical Team', 'IT Field Team', 'Installation Team'] as const;
export const MAINTENANCE_TYPES = ['Time-Based', 'Meter-Based', 'Condition-Based', 'Statutory / Compliance'] as const;

export const CATEGORY_STATUSES = ['Active', 'Inactive'] as const;
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];

/** SRS 4.7 */
export interface ServiceCategory extends Identifiable, Auditable {
  readonly code: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly description: string;
  readonly status: CategoryStatus;
  readonly displayOrder: number;
}

export interface CategoryListItem extends ServiceCategory {
  readonly parentName: string | null;
  readonly childCount: number;
  readonly serviceCount: number;
  readonly activeServiceCount: number;
}

export type CategoryInput = Omit<ServiceCategory, keyof Identifiable | keyof Auditable>;

export interface ServiceOperational {
  readonly standardDuration: number | null;
  readonly minDuration: number | null;
  readonly maxDuration: number | null;
  readonly unit: ServiceUnit;
  readonly territoryId: string | null;
  readonly serviceHours: string;
  readonly emergencyAllowed: boolean;
}

export interface ServiceMaintenance {
  readonly maintenanceType: string;
  readonly recommendedFrequency: number | null;
  readonly frequencyUnit: FrequencyUnit | null;
  readonly checklistRequired: boolean;
  readonly inspectionRequired: boolean;
  readonly meterBased: boolean;
  readonly conditionBased: boolean;
}

export interface ServiceResources {
  readonly skill: string;
  readonly certification: string;
  readonly team: string;
  readonly equipment: string;
  readonly tools: string;
  readonly parts: string;
  readonly consumables: string;
}

export interface ServiceCommercial {
  readonly billable: boolean;
  readonly billingMethod: BillingMethod;
  readonly standardPrice: number | null;
  readonly currency: string;
  readonly taxProfileId: string | null;
  readonly costRate: number | null;
  readonly priceListId: string | null;
  readonly discountAllowed: boolean;
  /** Can be included in contracts / AMCs (SRS 4.14). */
  readonly contractEligible: boolean;
  readonly amcEligible: boolean;
}

export interface ServiceSla {
  readonly applicable: boolean;
  readonly defaultSlaId: string | null;
  readonly responseHours: number | null;
  readonly resolutionHours: number | null;
  readonly priority: Priority;
  readonly escalationRequired: boolean;
}

export interface ServiceDocumentation {
  readonly serviceInstructions: string;
  readonly technicianInstructions: string;
  readonly customerInstructions: string;
}

export interface Attachment {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly type: string;
  readonly uploadedBy: string;
  readonly uploadedAt: string;
}

/** SRS 4.5 — a service that can be offered, sold, scheduled, performed or included in a contract / AMC. */
export interface CatalogService extends Identifiable, Auditable {
  readonly code: string;
  readonly name: string;
  readonly shortName: string;
  readonly categoryId: string;
  readonly subcategoryId: string | null;
  readonly type: ServiceType;
  readonly status: ServiceStatus;
  readonly description: string;
  readonly serviceClass: string;
  readonly priority: Priority;
  readonly customerDescription: string;
  readonly internalDescription: string;
  readonly operational: ServiceOperational;
  readonly maintenance: ServiceMaintenance;
  readonly resources: ServiceResources;
  readonly commercial: ServiceCommercial;
  readonly sla: ServiceSla;
  readonly documentation: ServiceDocumentation;
  readonly attachments: readonly Attachment[];
}

export type ServiceUpsert = Omit<CatalogService, keyof Identifiable | keyof Auditable>;

export interface ServiceListItem extends CatalogService {
  readonly categoryName: string;
  readonly subcategoryName: string | null;
  readonly slaName: string | null;
  readonly entitlementCount: number;
  readonly activeEntitlementCount: number;
  readonly usageCount: number;
  readonly priceRuleCount: number;
}
