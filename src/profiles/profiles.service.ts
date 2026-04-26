import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Profile } from './profile.entity';
import { randomUUID } from 'crypto';

export interface ProfileFilters {
  gender?: string;
  age_group?: string;
  country_id?: string;
  min_age?: number;
  max_age?: number;
  min_gender_probability?: number;
  min_country_probability?: number;
}

export interface PaginationAndSort {
  page?: number;
  limit?: number;
  sort_by?: 'age' | 'created_at' | 'gender_probability';
  order?: 'asc' | 'desc';
}

// Helper to determine age_group from age
function getAgeGroup(age: number): string {
  if (age < 13) return 'child';
  if (age < 20) return 'teenager';
  if (age < 60) return 'adult';
  return 'senior';
}

// Country code to name mapping
const COUNTRY_MAP: Record<string, string> = {
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

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
  ) {}

  private applyFilters(
    queryBuilder: SelectQueryBuilder<Profile>,
    filters: ProfileFilters,
  ) {
    if (filters.gender) {
      queryBuilder.andWhere('profile.gender = :gender', {
        gender: filters.gender.toLowerCase(),
      });
    }
    if (filters.age_group) {
      queryBuilder.andWhere('profile.age_group = :age_group', {
        age_group: filters.age_group.toLowerCase(),
      });
    }
    if (filters.country_id) {
      if (filters.country_id.length > 2) {
        queryBuilder.andWhere('LOWER(profile.country_name) = LOWER(:country_name)', {
          country_name: filters.country_id,
        });
      } else {
        queryBuilder.andWhere('profile.country_id = :country_id', {
          country_id: filters.country_id.toUpperCase(),
        });
      }
    }
    if (filters.min_age !== undefined) {
      queryBuilder.andWhere('profile.age >= :min_age', {
        min_age: filters.min_age,
      });
    }
    if (filters.max_age !== undefined) {
      queryBuilder.andWhere('profile.age <= :max_age', {
        max_age: filters.max_age,
      });
    }
    if (filters.min_gender_probability !== undefined) {
      queryBuilder.andWhere(
        'profile.gender_probability >= :min_gender_probability',
        { min_gender_probability: filters.min_gender_probability },
      );
    }
    if (filters.min_country_probability !== undefined) {
      queryBuilder.andWhere(
        'profile.country_probability >= :min_country_probability',
        { min_country_probability: filters.min_country_probability },
      );
    }
  }

  // Build pagination links
  private buildLinks(
    basePath: string,
    page: number,
    limit: number,
    totalPages: number,
    extraParams?: Record<string, string>,
  ) {
    const buildUrl = (p: number) => {
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('limit', String(limit));
      if (extraParams) {
        for (const [key, val] of Object.entries(extraParams)) {
          if (val !== undefined && val !== '') {
            params.set(key, val);
          }
        }
      }
      return `${basePath}?${params.toString()}`;
    };

    return {
      self: buildUrl(page),
      next: page < totalPages ? buildUrl(page + 1) : null,
      prev: page > 1 ? buildUrl(page - 1) : null,
    };
  }

  async createProfiles(data: any | any[]) {
    const items = Array.isArray(data) ? data : [data];

    const mappedItems = items.map((item) => {
      const copy = { ...item };
      if (!copy.id) {
        copy.id = randomUUID();
      }
      return copy;
    });

    return await this.profileRepository.save(mappedItems, { chunk: 100 });
  }

  async deleteAll() {
    await this.profileRepository.clear();
  }

  async findById(id: string): Promise<Profile | null> {
    return this.profileRepository.findOne({ where: { id } });
  }

  async findAll(
    filters: ProfileFilters,
    pagination: PaginationAndSort,
    basePath: string = '/api/profiles',
    extraParams?: Record<string, string>,
  ) {
    const page = pagination.page || 1;
    const limit = Math.min(pagination.limit || 10, 100);
    const skip = (page - 1) * limit;
    
    // Default sorts
    const sortBy = pagination.sort_by || 'created_at';
    const order = (pagination.order || 'desc').toUpperCase() as 'ASC' | 'DESC';

    const queryBuilder = this.profileRepository.createQueryBuilder('profile');

    this.applyFilters(queryBuilder, filters);

    queryBuilder.orderBy(`profile.${sortBy}`, order);
    queryBuilder.skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      status: 'success',
      page,
      limit,
      total,
      total_pages: totalPages,
      links: this.buildLinks(basePath, page, limit, totalPages, extraParams),
      data,
    };
  }

  // Create a profile by calling external APIs (Stage 1 logic)
  async createProfileFromName(name: string): Promise<Profile> {
    // Call Genderize API
    const genderRes = await fetch(`https://api.genderize.io?name=${encodeURIComponent(name.split(' ')[0])}`);
    const genderData = await genderRes.json();

    // Call Agify API
    const ageRes = await fetch(`https://api.agify.io?name=${encodeURIComponent(name.split(' ')[0])}`);
    const ageData = await ageRes.json();

    // Call Nationalize API
    const nationRes = await fetch(`https://api.nationalize.io?name=${encodeURIComponent(name.split(' ')[0])}`);
    const nationData = await nationRes.json();

    const gender = genderData.gender || 'unknown';
    const genderProbability = genderData.probability || 0;
    const age = ageData.age || 0;
    const ageGroup = getAgeGroup(age);

    // Get the most likely country
    const topCountry = nationData.country?.[0] || {};
    const countryId = topCountry.country_id || 'XX';
    const countryProbability = topCountry.probability || 0;
    const countryName = COUNTRY_MAP[countryId] || countryId;

    const profile = this.profileRepository.create({
      id: randomUUID(),
      name,
      gender,
      gender_probability: genderProbability,
      age,
      age_group: ageGroup,
      country_id: countryId,
      country_name: countryName,
      country_probability: countryProbability,
    });

    return await this.profileRepository.save(profile);
  }

  // Export profiles as CSV
  async exportCSV(
    filters: ProfileFilters,
    sortConfig?: { sort_by?: string; order?: string },
  ): Promise<string> {
    const sortBy = sortConfig?.sort_by || 'created_at';
    const order = (sortConfig?.order || 'desc').toUpperCase() as 'ASC' | 'DESC';

    const queryBuilder = this.profileRepository.createQueryBuilder('profile');
    this.applyFilters(queryBuilder, filters);
    queryBuilder.orderBy(`profile.${sortBy}`, order);

    const profiles = await queryBuilder.getMany();

    // Build CSV manually
    const headers = [
      'id', 'name', 'gender', 'gender_probability', 'age',
      'age_group', 'country_id', 'country_name', 'country_probability', 'created_at',
    ];

    const csvRows = [headers.join(',')];

    for (const p of profiles) {
      const row = [
        p.id,
        `"${(p.name || '').replace(/"/g, '""')}"`,
        p.gender,
        p.gender_probability,
        p.age,
        p.age_group,
        p.country_id,
        `"${(p.country_name || '').replace(/"/g, '""')}"`,
        p.country_probability,
        p.created_at,
      ];
      csvRows.push(row.join(','));
    }

    return csvRows.join('\n');
  }

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

    if (!matchedSomething) {
      throw new BadRequestException('Unable to interpret query');
    }

    return filters;
  }
}
