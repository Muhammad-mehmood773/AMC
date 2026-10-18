import type { Auditable, Identifiable } from '@shared/models/entity';

/** SRS 8.2 — preventive and recurring maintenance models. */
export const PM_TYPE_GROUPS: readonly { readonly group: Strategy; readonly types: readonly string[] }[] = [
  { group: 'Time-Based', types: ['Daily Maintenance', 'Weekly Maintenance', 'Bi-Weekly Maintenance', 'Monthly Maintenance', 'Bi-Monthly Maintenance', 'Quarterly Maintenance', 'Semi-Annual Maintenance', 'Annual Maintenance', 'Custom Interval Maintenance'] },
  { group: 'Calendar-Based', types: ['Fixed Date Maintenance', 'Specific Day of Month', 'Specific Week of Month', 'Specific Day of Week', 'End-of-Month Maintenance', 'Start-of-Month Maintenance', 'Financial-Year Maintenance'] },
  { group: 'Meter-Based', types: ['Operating Hours', 'Mileage', 'Production Quantity', 'Usage Count', 'Machine Cycles', 'Runtime', 'Energy Consumption', 'Custom Meter'] },
  { group: 'Condition-Based', types: ['Temperature Threshold', 'Pressure Threshold', 'Vibration Threshold', 'Performance Threshold', 'Sensor Condition', 'Inspection Result', 'Asset Condition', 'Custom Condition'] },
  { group: 'Event-Based', types: ['After Installation', 'After Commissioning', 'After Repair', 'After Replacement', 'After Major Service', 'After Defined Usage Event'] },
];
export const PM_TYPES = PM_TYPE_GROUPS.flatMap((g) => g.types);

export const STRATEGIES = ['Time-Based', 'Calendar-Based', 'Meter-Based', 'Condition-Based', 'Event-Based'] as const;
export type Strategy = (typeof STRATEGIES)[number];

/** SRS 8.8 frequency types. */
export const FREQUENCY_TYPES = ['Daily', 'Weekly', 'Bi-Weekly', 'Monthly', 'Bi-Monthly', 'Quarterly', 'Semi-Annual', 'Annual', 'Custom', 'Meter-Based', 'Condition-Based', 'Event-Based'] as const;
export type FrequencyType = (typeof FREQUENCY_TYPES)[number];
export const FREQUENCY_UNITS = ['Days', 'Weeks', 'Months', 'Years', 'Hours', 'Kilometres', 'Cycles', 'Units', 'kWh'] as const;
export type FrequencyUnit = (typeof FREQUENCY_UNITS)[number];

export const CALENDAR_RULES = ['None', 'Fixed Date', 'Specific Day of Month', 'Specific Week of Month', 'Specific Day of Week', 'End of Month', 'Start of Month', 'Financial Year'] as const;
export type CalendarRule = (typeof CALENDAR_RULES)[number];

/** SRS 8.20 — plan statuses (occurrence statuses live in the schedule model). */
export const PLAN_STATUSES = ['Draft', 'Under Review', 'Approved', 'Active', 'Suspended', 'Cancelled', 'Archived'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const EDITABLE_PLAN_STATUSES: readonly PlanStatus[] = ['Draft', 'Under Review', 'Approved', 'Active', 'Suspended'];

export const HOLIDAY_HANDLING = ['Move to next working day', 'Move to previous working day', 'Keep date'] as const;
export const MAINTENANCE_WINDOWS = ['Business Hours (08:00–17:00)', 'Early Morning (06:00–09:00)', 'After Hours (18:00–23:00)', 'Night Shift (22:00–06:00)', 'Weekend Shutdown', '24/7'] as const;
export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const WORK_ORDER_TYPES = ['Preventive', 'Inspection', 'Calibration', 'Corrective'] as const;

export interface PartRequirement {
  readonly partNumber: string;
  readonly quantity: number;
}

export interface PlanDocument {
  readonly id: string;
  readonly name: string;
  readonly type: 'Maintenance Manual' | 'Manufacturer Guidelines' | 'Technical Document' | 'Safety Document' | 'Supporting Document';
  readonly size: number;
  readonly uploadedBy: string;
  readonly uploadedAt: string;
}

/** SRS 8.6 — preventive maintenance plan. */
export interface MaintenancePlan extends Identifiable, Auditable {
  readonly number: string;
  readonly name: string;
  readonly maintenanceType: string;
  readonly description: string;
  readonly status: PlanStatus;
  readonly approval: 'Not Submitted' | 'Pending' | 'Approved' | 'Rejected';
  readonly version: string;
  readonly externalReference: string;
  readonly location: { readonly customerId: string; readonly legalEntity: string; readonly siteId: string; readonly building: string; readonly floor: string; readonly area: string; readonly region: string };
  /** Asset scope — one or more assets of the site (SRS 8.25). */
  readonly assetIds: readonly string[];
  readonly assetCategory: string;
  readonly service: { readonly serviceId: string | null; readonly serviceCategory: string; readonly contractId: string | null; readonly amcId: string | null; readonly slaId: string | null; readonly coveredService: boolean; readonly entitlement: string };
  readonly strategy: { readonly strategy: Strategy; readonly preventive: boolean; readonly recurring: boolean };
  readonly frequency: {
    readonly type: FrequencyType;
    readonly value: number;
    readonly unit: FrequencyUnit;
    readonly calendarRule: CalendarRule;
    readonly dayOfMonth: number | null;
    readonly weekOfMonth: number | null;
    readonly dayOfWeek: number | null;
    readonly month: number | null;
    readonly startDate: string;
    readonly endDate: string | null;
    readonly leadTimeDays: number;
    readonly graceDays: number;
    /** Effective date of the current frequency (SRS 8.18). */
    readonly effectiveDate: string;
  };
  readonly scheduling: { readonly preferredDays: readonly string[]; readonly preferredTime: string; readonly window: string; readonly serviceHours: string; readonly businessCalendar: string; readonly holidayHandling: string; readonly weekendHandling: string; readonly autoReschedule: boolean; readonly maxRescheduleDays: number };
  readonly resources: { readonly skill: string; readonly certification: string; readonly technician: string | null; readonly team: string; readonly tools: string; readonly equipment: string };
  readonly parts: { readonly required: readonly PartRequirement[]; readonly replacementParts: string; readonly materialList: string };
  readonly procedure: { readonly checklistId: string | null; readonly taskIds: readonly string[]; readonly standardProcedure: string; readonly safety: string; readonly inspectionPoints: string; readonly measurements: string; readonly acceptance: string };
  readonly automation: { readonly autoGenerate: boolean; readonly leadDays: number; readonly woType: string; readonly priority: Priority; readonly team: string; readonly technician: string | null; readonly autoAssign: boolean; readonly autoDispatch: boolean };
  readonly notifications: { readonly reminder: boolean; readonly reminderDays: number; readonly technician: boolean; readonly supervisor: boolean; readonly customer: boolean; readonly overdue: boolean; readonly escalation: boolean };
  readonly notes: { readonly internal: string; readonly customer: string };
  readonly documents: readonly PlanDocument[];
}

export type PlanUpsert = Omit<MaintenancePlan, keyof Identifiable | keyof Auditable | 'number' | 'status' | 'approval' | 'version' | 'documents'>;

export interface PlanVersion {
  readonly planId: string;
  readonly version: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly summary: string;
  readonly frequency: string;
}

export interface PlanListItem extends MaintenancePlan {
  readonly customerName: string;
  readonly siteName: string;
  readonly assetNames: readonly string[];
  readonly serviceName: string | null;
  readonly frequencyLabel: string;
  readonly nextDueDate: string | null;
  readonly nextScheduledDate: string | null;
  readonly lastCompletedDate: string | null;
  readonly kpis: {
    readonly planned: number;
    readonly completed: number;
    readonly pending: number;
    readonly due: number;
    readonly overdue: number;
    readonly missed: number;
    readonly rescheduled: number;
    readonly workOrders: number;
    readonly completedWorkOrders: number;
    readonly partsUsed: number;
    readonly cost: number;
    readonly avgCompletionMinutes: number | null;
    readonly compliance: number | null;
  };
}
