/**
 * Country-specific address and business registration configuration.
 * Controls which address sub-fields are shown/required and what validation patterns to apply.
 * Add new countries here; the defaults apply to all unlisted countries.
 */

export interface AddressFieldConfig {
  /** Whether the building number field is shown (KSA National Address convention). */
  readonly showBuildingNumber: boolean;
  /** Regex for postal code validation. null = no strict validation (accepts any non-empty string). */
  readonly postalCodePattern: RegExp | null;
  /** Placeholder text for the postal code field. */
  readonly postalCodePlaceholder: string;
  /** Label for the postal code field. */
  readonly postalCodeLabel: string;
  /** Whether the KSA-specific "Additional Number" field is shown. */
  readonly showAdditionalNumber: boolean;
  /** Label used for the region/state field. */
  readonly regionLabel: string;
}

export interface BusinessIdConfig {
  /**
   * Primary business registration identifier for the country.
   * null = not applicable (e.g. individuals in countries with no mandatory ID).
   */
  readonly primaryId: {
    readonly label: string;
    readonly placeholder: string;
    readonly pattern: RegExp | null;
    readonly hint: string;
    readonly maxLength: number;
    readonly inputMode: string;
  } | null;
  /**
   * Tax / VAT identification number configuration.
   * null = not displayed.
   */
  readonly taxId: {
    readonly label: string;
    readonly placeholder: string;
    readonly pattern: RegExp | null;
    readonly hint: string;
    readonly maxLength: number;
    readonly inputMode: string;
  } | null;
  /** KSA-only: National Address Reference short code. */
  readonly showNationalAddress: boolean;
}

export interface CountryConfig {
  readonly address: AddressFieldConfig;
  readonly business: BusinessIdConfig;
}

const KSA_COUNTRY_NAMES = new Set(['Saudi Arabia']);
const US_CANADA_NAMES = new Set(['United States', 'Canada']);
const UK_NAMES = new Set(['United Kingdom']);
const PAKISTAN_NAMES = new Set(['Pakistan']);
const GCC_COUNTRY_NAMES = new Set(['United Arab Emirates', 'Bahrain', 'Kuwait', 'Oman', 'Qatar']);

/** Address configuration for Saudi Arabia (KSA National Address). */
const KSA_ADDRESS: AddressFieldConfig = {
  showBuildingNumber: true,
  postalCodePattern: /^\d{5}$/,
  postalCodePlaceholder: '5 digits',
  postalCodeLabel: 'Postal Code',
  showAdditionalNumber: true,
  regionLabel: 'Region',
};

/** Address configuration for US / Canada. */
const US_CA_ADDRESS: AddressFieldConfig = {
  showBuildingNumber: false,
  postalCodePattern: /^\d{5}(-\d{4})?$|^[A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d$/, // ZIP or Canadian postal
  postalCodePlaceholder: 'e.g. 90210 or M5V 3L9',
  postalCodeLabel: 'ZIP / Postal Code',
  showAdditionalNumber: false,
  regionLabel: 'State / Province',
};

/** Address configuration for the United Kingdom. */
const UK_ADDRESS: AddressFieldConfig = {
  showBuildingNumber: false,
  postalCodePattern: /^[A-Za-z]{1,2}\d[A-Za-z\d]? ?\d[A-Za-z]{2}$/,
  postalCodePlaceholder: 'e.g. SW1A 1AA',
  postalCodeLabel: 'Postcode',
  showAdditionalNumber: false,
  regionLabel: 'Region / County',
};

/** Address configuration for GCC countries (UAE, Bahrain, Kuwait, Oman, Qatar). */
const GCC_ADDRESS: AddressFieldConfig = {
  showBuildingNumber: false,
  postalCodePattern: /^\d{3,6}$/,
  postalCodePlaceholder: 'Postal code',
  postalCodeLabel: 'Postal Code',
  showAdditionalNumber: false,
  regionLabel: 'Emirate / Region',
};

/** Address configuration for Pakistan. */
const PK_ADDRESS: AddressFieldConfig = {
  showBuildingNumber: false,
  postalCodePattern: /^\d{5}$/,
  postalCodePlaceholder: 'e.g. 75500',
  postalCodeLabel: 'Postal Code',
  showAdditionalNumber: false,
  regionLabel: 'Province',
};

/** Generic international address configuration. */
const DEFAULT_ADDRESS: AddressFieldConfig = {
  showBuildingNumber: false,
  postalCodePattern: null,
  postalCodePlaceholder: 'Postal / ZIP code',
  postalCodeLabel: 'Postal Code',
  showAdditionalNumber: false,
  regionLabel: 'State / Region',
};

/** Business registration IDs for Saudi Arabia. */
const KSA_BUSINESS: BusinessIdConfig = {
  primaryId: {
    label: 'Commercial Registration (CR) Number',
    placeholder: '1010123456',
    pattern: /^\d{10}$/,
    hint: '10 digits',
    maxLength: 10,
    inputMode: 'numeric',
  },
  taxId: {
    label: 'VAT / Tax Registration Number',
    placeholder: '300000000000003',
    pattern: /^3\d{13}3$/,
    hint: '15 digits, starts and ends with 3',
    maxLength: 15,
    inputMode: 'numeric',
  },
  showNationalAddress: true,
};

/** Business registration IDs for US / Canada. */
const US_BUSINESS: BusinessIdConfig = {
  primaryId: {
    label: 'EIN / Business Number',
    placeholder: 'e.g. 12-3456789',
    pattern: /^\d{2}-\d{7}$|^\d{9}$/,
    hint: '9-digit Employer Identification Number',
    maxLength: 12,
    inputMode: 'numeric',
  },
  taxId: {
    label: 'Sales Tax / GST Number',
    placeholder: 'e.g. 123456789',
    pattern: null,
    hint: 'State sales tax or GST/HST number',
    maxLength: 30,
    inputMode: 'text',
  },
  showNationalAddress: false,
};

/** Business registration IDs for the United Kingdom. */
const UK_BUSINESS: BusinessIdConfig = {
  primaryId: {
    label: 'Company Registration Number',
    placeholder: 'e.g. 12345678',
    pattern: /^\d{8}$|^[A-Za-z]{2}\d{6}$/,
    hint: '8-digit Companies House number',
    maxLength: 10,
    inputMode: 'text',
  },
  taxId: {
    label: 'VAT Registration Number',
    placeholder: 'e.g. GB 123 4567 89',
    pattern: /^(GB)?\s?\d{3}\s?\d{4}\s?\d{2}(\s?\d{3})?$/i,
    hint: 'HMRC VAT number, e.g. GB 123 4567 89',
    maxLength: 16,
    inputMode: 'text',
  },
  showNationalAddress: false,
};

/** Business registration IDs for GCC countries. */
const GCC_BUSINESS: BusinessIdConfig = {
  primaryId: {
    label: 'Trade / Business License Number',
    placeholder: 'Business license number',
    pattern: null,
    hint: 'Trade license or commercial registration number',
    maxLength: 30,
    inputMode: 'text',
  },
  taxId: {
    label: 'TRN / VAT Registration Number',
    placeholder: 'Tax registration number',
    pattern: null,
    hint: 'Tax Registration Number (TRN) or equivalent',
    maxLength: 30,
    inputMode: 'text',
  },
  showNationalAddress: false,
};

/** Business registration IDs for EU countries (Germany, France, Netherlands, etc.). */
const EU_BUSINESS: BusinessIdConfig = {
  primaryId: {
    label: 'Company Registration Number',
    placeholder: 'Local registration number',
    pattern: null,
    hint: 'Commercial register number (e.g. HRB, SIREN, KvK)',
    maxLength: 30,
    inputMode: 'text',
  },
  taxId: {
    label: 'VAT Registration Number',
    placeholder: 'e.g. DE123456789',
    pattern: null,
    hint: 'EU VAT number including country prefix, e.g. DE123456789',
    maxLength: 20,
    inputMode: 'text',
  },
  showNationalAddress: false,
};

/** Business registration IDs for Pakistan. */
const PK_BUSINESS: BusinessIdConfig = {
  primaryId: {
    label: 'CNIC / NTN / SECP Number',
    placeholder: 'e.g. 1234567-8 or 1234567',
    pattern: null,
    hint: 'CNIC, NTN or SECP incorporation number',
    maxLength: 20,
    inputMode: 'text',
  },
  taxId: {
    label: 'NTN / GST Registration Number',
    placeholder: 'e.g. 1234567-2',
    pattern: null,
    hint: 'FBR National Tax Number or STRN',
    maxLength: 20,
    inputMode: 'text',
  },
  showNationalAddress: false,
};

/** Generic international business IDs. */
const DEFAULT_BUSINESS: BusinessIdConfig = {
  primaryId: {
    label: 'Business Registration Number',
    placeholder: 'Registration number',
    pattern: null,
    hint: 'Local business or commercial registration number',
    maxLength: 50,
    inputMode: 'text',
  },
  taxId: {
    label: 'Tax Registration Number',
    placeholder: 'Tax / VAT number',
    pattern: null,
    hint: 'Local tax or VAT registration number',
    maxLength: 30,
    inputMode: 'text',
  },
  showNationalAddress: false,
};

/** EU country names that use the EU business config. */
const EU_COUNTRY_NAMES = new Set([
  'Germany', 'France', 'Netherlands', 'Belgium', 'Austria', 'Switzerland',
  'Italy', 'Spain', 'Portugal', 'Sweden', 'Norway', 'Denmark', 'Finland',
  'Poland', 'Czech Republic', 'Hungary', 'Romania', 'Greece', 'Turkey',
]);

/**
 * Returns the country-specific configuration for address fields and business identifiers.
 * Falls back to safe international defaults for unlisted countries.
 */
export function getCountryConfig(country: string): CountryConfig {
  if (KSA_COUNTRY_NAMES.has(country)) return { address: KSA_ADDRESS, business: KSA_BUSINESS };
  if (US_CANADA_NAMES.has(country)) return { address: US_CA_ADDRESS, business: US_BUSINESS };
  if (UK_NAMES.has(country)) return { address: UK_ADDRESS, business: UK_BUSINESS };
  if (GCC_COUNTRY_NAMES.has(country)) return { address: GCC_ADDRESS, business: GCC_BUSINESS };
  if (EU_COUNTRY_NAMES.has(country)) return { address: DEFAULT_ADDRESS, business: EU_BUSINESS };
  if (PAKISTAN_NAMES.has(country)) return { address: PK_ADDRESS, business: PK_BUSINESS };
  return { address: DEFAULT_ADDRESS, business: DEFAULT_BUSINESS };
}

/** Returns true when the country is Saudi Arabia. */
export function isKsa(country: string): boolean {
  return KSA_COUNTRY_NAMES.has(country);
}
