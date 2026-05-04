import { Injectable, BadRequestException } from '@nestjs/common';
import { ProfileFilters } from './profiles.types';
import { COUNTRY_MAP } from './profiles.constants';

@Injectable()
export class QueryParserService {
  parseNaturalLanguage(q: string): ProfileFilters {
    if (!q || typeof q !== 'string') {
      throw new BadRequestException('Unable to interpret query');
    }

    const lowerQ = q.toLowerCase();
    const filters: ProfileFilters = {};

    let matchedSomething = false;

    // GENDER — use word boundaries to cleanly separate male/female/males/females
    if (/\bfemales?\b/.test(lowerQ) || /\b(women|woman|girl|girls)\b/.test(lowerQ)) {
      filters.gender = 'female';
      matchedSomething = true;
    } else if (/\bmales?\b/.test(lowerQ) || /\b(men|man|boy|boys)\b/.test(lowerQ)) {
      filters.gender = 'male';
      matchedSomething = true;
    }

    // AGE GROUPS & KEYWORDS
    if (lowerQ.includes('young')) {
      filters.min_age = 16;
      filters.max_age = 24;
      matchedSomething = true;
    }
    if (/\bteenagers?\b/.test(lowerQ)) {
      filters.age_group = 'teenager';
      matchedSomething = true;
    }
    if (/\badults?\b/.test(lowerQ)) {
      filters.age_group = 'adult';
      matchedSomething = true;
    }
    if (/\b(child|children)\b/.test(lowerQ)) {
      filters.age_group = 'child';
      matchedSomething = true;
    }
    if (/\bseniors?\b/.test(lowerQ) || /\b(elderly|old)\b/.test(lowerQ)) {
      filters.age_group = 'senior';
      matchedSomething = true;
    }

    // MIN / MAX AGE
    const aboveMatch = lowerQ.match(/(?:above|over|older than|greater than)\s+(\d+)/);
    if (aboveMatch) {
      filters.min_age = parseInt(aboveMatch[1], 10);
      matchedSomething = true;
    }

    const belowMatch = lowerQ.match(/(?:below|under|younger than|less than)\s+(\d+)/);
    if (belowMatch) {
      filters.max_age = parseInt(belowMatch[1], 10);
      matchedSomething = true;
    }

    // Between pattern: "between X and Y"
    const betweenMatch = lowerQ.match(/between\s+(\d+)\s+and\s+(\d+)/);
    if (betweenMatch) {
      filters.min_age = parseInt(betweenMatch[1], 10);
      filters.max_age = parseInt(betweenMatch[2], 10);
      matchedSomething = true;
    }

    // COUNTRY
    const fromMatch = lowerQ.match(/from\s+([a-z\s]+?)(\s+(above|below|under|over|older|younger|between).*)?$/);
    if (fromMatch) {
      const parsedCountry = fromMatch[1].trim();
      if (parsedCountry) {
        filters.country_id = parsedCountry;
        matchedSomething = true;
      }
    }

    // Also detect "in <country>" pattern
    if (!filters.country_id) {
      const inMatch = lowerQ.match(/\bin\s+([a-z\s]+?)(\s+(above|below|under|over|older|younger|between).*)?$/);
      if (inMatch) {
        const parsedCountry = inMatch[1].trim();
        if (parsedCountry) {
          filters.country_id = parsedCountry;
          matchedSomething = true;
        }
      }
    }

    // Standalone country code or demonym fallback
    if (!filters.country_id) {
      if (/\b(nigeria|nigerians?|ng)\b/.test(lowerQ)) { filters.country_id = 'NG'; matchedSomething = true; }
      else if (/\b(united states|americans?|usa?)\b/.test(lowerQ)) { filters.country_id = 'US'; matchedSomething = true; }
      else if (/\b(united kingdom|british|uk|gb)\b/.test(lowerQ)) { filters.country_id = 'GB'; matchedSomething = true; }
      else if (/\b(ghana|ghanaians?|gh)\b/.test(lowerQ)) { filters.country_id = 'GH'; matchedSomething = true; }
      else if (/\b(kenya|kenyans?|ke)\b/.test(lowerQ)) { filters.country_id = 'KE'; matchedSomething = true; }
      else if (/\b(south africa|south africans?|za)\b/.test(lowerQ)) { filters.country_id = 'ZA'; matchedSomething = true; }
      else if (/\b(india|indians?|in)\b/.test(lowerQ)) { filters.country_id = 'IN'; matchedSomething = true; }
      else {
        // Dynamic fallback loop against the COUNTRY_MAP
        for (const [code, name] of Object.entries(COUNTRY_MAP)) {
          if (new RegExp(`\\b${name.toLowerCase()}\\b`).test(lowerQ) || new RegExp(`\\b${code.toLowerCase()}\\b`).test(lowerQ)) {
            filters.country_id = code;
            matchedSomething = true;
            break;
          }
        }
      }
    }

    if (!matchedSomething) {
      throw new BadRequestException('Unable to interpret query');
    }

    return filters;
  }
}
