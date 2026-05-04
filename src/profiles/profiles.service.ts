import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Profile } from './profile.entity';
import { randomUUID } from 'crypto';
import { ProfileFilters, PaginationAndSort } from './profiles.types';
import { getAgeGroup, COUNTRY_MAP } from './profiles.constants';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
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
    const cacheKey = `profile:id:${id}`;
    const cached = await this.cacheManager.get<Profile>(cacheKey);
    if (cached) return cached;
    const profile = await this.profileRepository.findOne({ where: { id } });
    if (profile) await this.cacheManager.set(cacheKey, profile, 300000); // 5 minutes
    return profile;
  }

  private normalizeFilters(filters: ProfileFilters): string {
    const sortedKeys = Object.keys(filters).sort();
    const normalizedObj: any = {};
    for (const key of sortedKeys) {
      const val = filters[key as keyof ProfileFilters];
      if (val !== undefined && val !== null && val !== '') {
        // Lowercase string filters to ensure equivalent queries resolve to the same cache key
        normalizedObj[key] = typeof val === 'string' ? val.toLowerCase() : val;
      }
    }
    return JSON.stringify(normalizedObj);
  }

  private getCacheKey(filters: ProfileFilters, pagination: PaginationAndSort): string {
    const filtersKey = this.normalizeFilters(filters);
    const page = pagination.page || 1;
    const limit = Math.min(pagination.limit || 10, 100);
    const sortBy = (pagination.sort_by || 'created_at').toLowerCase();
    const order = (pagination.order || 'desc').toLowerCase();
    return `profiles:${filtersKey}:${page}:${limit}:${sortBy}:${order}`;
  }

  async findAll(
    filters: ProfileFilters,
    pagination: PaginationAndSort,
    basePath: string = '/api/profiles',
    extraParams?: Record<string, string>,
  ) {
    const cacheKey = this.getCacheKey(filters, pagination);
    const cachedResult = await this.cacheManager.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }
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

    const result = {
      status: 'success',
      page,
      limit,
      total,
      total_pages: totalPages,
      links: this.buildLinks(basePath, page, limit, totalPages, extraParams),
      data,
    };

    await this.cacheManager.set(cacheKey, result, 300000); // 5 minutes

    return result;
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
}
