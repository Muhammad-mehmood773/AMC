/**
 * Returns the Unicode flag emoji for a country name.
 * Falls back to a globe emoji for unknown countries.
 */
export function countryFlag(country: string): string {
  const map: Record<string, string> = {
    'Saudi Arabia': '🇸🇦',
    'United Arab Emirates': '🇦🇪',
    'Bahrain': '🇧🇭',
    'Kuwait': '🇰🇼',
    'Oman': '🇴🇲',
    'Qatar': '🇶🇦',
    'United States': '🇺🇸',
    'Canada': '🇨🇦',
    'United Kingdom': '🇬🇧',
    'Germany': '🇩🇪',
    'France': '🇫🇷',
    'Netherlands': '🇳🇱',
    'Belgium': '🇧🇪',
    'Austria': '🇦🇹',
    'Switzerland': '🇨🇭',
    'Italy': '🇮🇹',
    'Spain': '🇪🇸',
    'Portugal': '🇵🇹',
    'Sweden': '🇸🇪',
    'Norway': '🇳🇴',
    'Denmark': '🇩🇰',
    'Finland': '🇫🇮',
    'Poland': '🇵🇱',
    'Czech Republic': '🇨🇿',
    'Hungary': '🇭🇺',
    'Romania': '🇷🇴',
    'Greece': '🇬🇷',
    'Turkey': '🇹🇷',
    'Pakistan': '🇵🇰',
    'India': '🇮🇳',
    'Jordan': '🇯🇴',
    'Egypt': '🇪🇬',
    'Lebanon': '🇱🇧',
  };
  return map[country] ?? '🌐';
}
