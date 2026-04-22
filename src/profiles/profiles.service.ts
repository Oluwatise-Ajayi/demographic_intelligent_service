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

  async findAll(filters: ProfileFilters, pagination: PaginationAndSort) {
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

    return {
      status: 'success',
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data,
    };
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
