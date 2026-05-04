export function getAgeGroup(age: number): string {
  if (age < 13) return 'child';
  if (age < 20) return 'teenager';
  if (age < 60) return 'adult';
  return 'senior';
}

export const COUNTRY_MAP: Record<string, string> = {
  AF: 'Afghanistan', AL: 'Albania', DZ: 'Algeria', AD: 'Andorra', AO: 'Angola',
  AR: 'Argentina', AU: 'Australia', AT: 'Austria', BD: 'Bangladesh', BE: 'Belgium',
  BR: 'Brazil', CA: 'Canada', CL: 'Chile', CN: 'China', CO: 'Colombia',
  EG: 'Egypt', ET: 'Ethiopia', FI: 'Finland', FR: 'France', DE: 'Germany',
  GH: 'Ghana', GR: 'Greece', IN: 'India', ID: 'Indonesia', IE: 'Ireland',
  IL: 'Israel', IT: 'Italy', JP: 'Japan', KE: 'Kenya', MY: 'Malaysia',
  MX: 'Mexico', NL: 'Netherlands', NZ: 'New Zealand', NG: 'Nigeria', NO: 'Norway',
  PK: 'Pakistan', PH: 'Philippines', PL: 'Poland', PT: 'Portugal', RO: 'Romania',
  RU: 'Russia', SA: 'Saudi Arabia', SG: 'Singapore', ZA: 'South Africa',
  KR: 'South Korea', ES: 'Spain', SE: 'Sweden', CH: 'Switzerland', TH: 'Thailand',
  TR: 'Turkey', UA: 'Ukraine', AE: 'United Arab Emirates', GB: 'United Kingdom',
  US: 'United States', VN: 'Vietnam',
};
