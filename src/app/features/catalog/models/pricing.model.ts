/** SRS 4.8 — service pricing & commercial rules, maintained independently from the service. */

export const PRICING_MODELS = ['Fixed Price', 'Per Visit', 'Per Hour', 'Per Unit', 'Time & Material', 'Contract Price', 'Customer-Specific Price'] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export type PriceRuleState = 'Active' | 'Scheduled' | 'Expired';

export interface PriceRule {
  readonly id: string;
  readonly serviceId: string;
  readonly priceListId: string | null;
  /** Scope — a null scope field matches any value. */
  readonly customerId: string | null;
  readonly customerType: string | null;
  readonly customerCategory: string | null;
  readonly agreementId: string | null;
  readonly serviceRegion: string | null;
  readonly model: PricingModel;
  readonly currency: string;
  readonly unit: string;
  readonly basePrice: number;
  readonly minCharge: number | null;
  readonly maxCharge: number | null;
  readonly discountAllowed: boolean;
  readonly discountLimit: number | null;
  readonly taxProfileId: string | null;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly createdAt: string;
  readonly createdBy: string;
}

export type PriceRuleInput = Omit<PriceRule, 'id' | 'createdAt' | 'createdBy'>;

export interface PriceRuleListItem extends PriceRule {
  readonly state: PriceRuleState;
  readonly serviceCode: string;
  readonly serviceName: string;
  readonly serviceType: string;
  readonly priceListName: string | null;
  readonly customerName: string | null;
  readonly agreementNumber: string | null;
  readonly taxProfileName: string | null;
  /** Human-readable scope, e.g. "Government · Contract CON-00101". */
  readonly scope: string;
  readonly specificity: number;
}

/** Context used to resolve the applicable price (customer, category, contract / AMC, region, date). */
export interface PriceContext {
  readonly serviceId: string;
  readonly customerId: string | null;
  readonly agreementId: string | null;
  readonly serviceRegion: string | null;
  readonly date: string;
  readonly quantity: number;
}

export interface PriceQuote {
  readonly serviceId: string;
  readonly rule: PriceRuleListItem | null;
  readonly source: string;
  readonly model: string;
  readonly currency: string;
  readonly unitPrice: number;
  readonly quantity: number;
  readonly subtotal: number;
  readonly charged: number;
  readonly notes: readonly string[];
}

export interface PriceRuleFilter {
  readonly serviceId?: string;
}
