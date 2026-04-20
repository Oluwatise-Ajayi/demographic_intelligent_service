import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Profile } from './profile.entity';

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

  async findAll(filters: ProfileFilters, pagination: PaginationAndSort) {
    const page = pagination.page || 1;
    const limit = Math.min(pagination.limit || 10, 50);
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

    // GENDER
    if (lowerQ.includes('male') && !lowerQ.includes('female')) {
      filters.gender = 'male';
      matchedSomething = true;
    } else if (lowerQ.match(/\b(men|boy|boys)\b/)) {
      filters.gender = 'male';
      matchedSomething = true;
    } else if (
      (lowerQ.includes('female') && !lowerQ.match(/\bmale\b/)) ||
      lowerQ.match(/\b(women|girl|girls)\b/)
    ) {
      // Note: "female" contains "male", handled carefully
      filters.gender = 'female';
      matchedSomething = true;
    } else if (lowerQ.match(/\bfemales\b/) && !lowerQ.match(/\bmales\b/)) {
      filters.gender = 'female';
      matchedSomething = true;
    } else if (lowerQ.match(/\bfemale\b/) && !lowerQ.match(/\b(?<!fe)male\b/)) {
        filters.gender = 'female';
        matchedSomething = true;
    } else if (lowerQ.match(/\b(?<!fe)male\b/) && !lowerQ.match(/\bfemale\b/)) {
        filters.gender = 'male';
        matchedSomething = true;
    }

    // AGE GROUPS & KEYWORDS
    if (lowerQ.includes('young')) {
      filters.min_age = 16;
      filters.max_age = 24;
      matchedSomething = true;
    }
    if (lowerQ.includes('teenager') || lowerQ.includes('teenagers')) {
      filters.age_group = 'teenager';
      matchedSomething = true;
    }
    if (lowerQ.includes('adult') || lowerQ.includes('adults')) {
      filters.age_group = 'adult';
      matchedSomething = true;
    }
    if (lowerQ.includes('child') || lowerQ.includes('children')) {
      filters.age_group = 'child';
      matchedSomething = true;
    }
    if (lowerQ.includes('senior') || lowerQ.includes('seniors')) {
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

    // COUNTRY
    // We already augmented applyFilters to automatically lookup full country names 
    // if the provided country_id is longer than 2 characters (e.g. "algeria").
    // We extract whatever text follows "from " (ignoring subsequent age modifiers)
    const fromMatch = lowerQ.match(/from\s+([a-z\s]+?)(\s+(above|below|under|over|older|younger).*)?$/);
    if (fromMatch) {
      const parsedCountry = fromMatch[1].trim();
      if (parsedCountry) {
        filters.country_id = parsedCountry; // applyFilters will automatically use ILIKE/LOWER for > 2 chars!
        matchedSomething = true;
      }
    }

    if (!matchedSomething) {
      throw new BadRequestException('Unable to interpret query');
    }

    return filters;
  }
}
