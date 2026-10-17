import type { LookupTypeDefinition } from '@shared/lookups/lookup';
import { CONTRACT_CATEGORIES, COST_CENTERS, GOVERNING_LAWS, JURISDICTIONS, PROFIT_CENTERS } from '../models/contract.model';

export const CONTRACT_LOOKUP = {
  category: 'contract-category',
  governingLaw: 'contract-governing-law',
  jurisdiction: 'contract-jurisdiction',
  costCenter: 'contract-cost-center',
  profitCenter: 'contract-profit-center',
} as const;

export type ContractLookupType = (typeof CONTRACT_LOOKUP)[keyof typeof CONTRACT_LOOKUP];

/** Lists organizations maintain themselves; types, statuses and workflow values stay fixed. */
export const CONTRACT_LOOKUP_TYPES: readonly LookupTypeDefinition[] = [
  { key: CONTRACT_LOOKUP.category, label: 'Contract Category', editable: true },
  { key: CONTRACT_LOOKUP.governingLaw, label: 'Governing Law', editable: true },
  { key: CONTRACT_LOOKUP.jurisdiction, label: 'Jurisdiction', editable: true },
  { key: CONTRACT_LOOKUP.costCenter, label: 'Cost Center', editable: true },
  { key: CONTRACT_LOOKUP.profitCenter, label: 'Profit Center', editable: true },
];

export const CONTRACT_LOOKUP_SEED: Readonly<Record<ContractLookupType, readonly string[]>> = {
  [CONTRACT_LOOKUP.category]: CONTRACT_CATEGORIES,
  [CONTRACT_LOOKUP.governingLaw]: GOVERNING_LAWS,
  [CONTRACT_LOOKUP.jurisdiction]: JURISDICTIONS,
  [CONTRACT_LOOKUP.costCenter]: COST_CENTERS,
  [CONTRACT_LOOKUP.profitCenter]: PROFIT_CENTERS,
};
