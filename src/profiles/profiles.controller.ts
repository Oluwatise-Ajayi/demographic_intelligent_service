import { Controller, Get, Query, HttpException, HttpStatus } from '@nestjs/common';
import { ApiQuery, ApiOperation } from '@nestjs/swagger';
import { ProfilesService, ProfileFilters, PaginationAndSort } from './profiles.service';

@Controller('api/profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all profiles comprehensively' })
  @ApiQuery({ name: 'gender', required: false, type: String })
  @ApiQuery({ name: 'age_group', required: false, type: String, description: 'child, teenager, adult, senior' })
  @ApiQuery({ name: 'country_id', required: false, type: String, description: 'ISO code e.g., NG' })
  @ApiQuery({ name: 'min_age', required: false, type: String })
  @ApiQuery({ name: 'max_age', required: false, type: String })
  @ApiQuery({ name: 'min_gender_probability', required: false, type: String })
  @ApiQuery({ name: 'min_country_probability', required: false, type: String })
  @ApiQuery({ name: 'sort_by', required: false, enum: ['age', 'created_at', 'gender_probability'] })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'page', required: true, type: String, example: '1' })
  @ApiQuery({ name: 'limit', required: true, type: String, example: '10' })
  async getProfiles(
    @Query('gender') gender?: string,
    @Query('age_group') age_group?: string,
    @Query('country_id') country_id?: string,
    @Query('min_age') min_age?: string,
    @Query('max_age') max_age?: string,
    @Query('min_gender_probability') min_gender_probability?: string,
    @Query('min_country_probability') min_country_probability?: string,
    @Query('sort_by') sort_by?: 'age' | 'created_at' | 'gender_probability',
    @Query('order') order?: 'asc' | 'desc',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const filters: ProfileFilters = {};
      if (gender) filters.gender = gender;
      if (age_group) filters.age_group = age_group;
      if (country_id) filters.country_id = country_id;
      if (min_age) {
        if (isNaN(Number(min_age))) throw new Error('Invalid parameter type');
        filters.min_age = Number(min_age);
      }
      if (max_age) {
        if (isNaN(Number(max_age))) throw new Error('Invalid parameter type');
        filters.max_age = Number(max_age);
      }
      if (min_gender_probability) {
        if (isNaN(Number(min_gender_probability))) throw new Error('Invalid parameter type');
        filters.min_gender_probability = Number(min_gender_probability);
      }
      if (min_country_probability) {
        if (isNaN(Number(min_country_probability))) throw new Error('Invalid parameter type');
        filters.min_country_probability = Number(min_country_probability);
      }

      const pagination: PaginationAndSort = {};
      if (sort_by) pagination.sort_by = sort_by;
      if (order) pagination.order = order as any;
      
      const p = page ? Number(page) : 1;
      const l = limit ? Number(limit) : 10;
      if (isNaN(p) || isNaN(l)) throw new Error('Invalid parameter type');
      
      pagination.page = p;
      pagination.limit = l;

      return await this.profilesService.findAll(filters, pagination);
    } catch (e: any) {
      if (e.message === 'Invalid parameter type') {
        throw new HttpException({ status: 'error', message: 'Invalid query parameters' }, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      throw new HttpException({ status: 'error', message: e.message || 'Server failure' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('search')
  @ApiOperation({ summary: 'Search profiles using Natural Language Querying' })
  @ApiQuery({ name: 'q', required: true, type: String, example: 'young males from nigeria' })
  @ApiQuery({ name: 'page', required: true, type: String, example: '1' })
  @ApiQuery({ name: 'limit', required: true, type: String, example: '10' })
  async searchProfiles(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!q || String(q).trim() === '') {
      throw new HttpException(
        { status: 'error', message: 'Unable to interpret query' },
        HttpStatus.BAD_REQUEST, // Or 400
      );
    }

    try {
      const filters = this.profilesService.parseNaturalLanguage(String(q));

      const pagination: PaginationAndSort = {};
      const p = page ? Number(page) : 1;
      const l = limit ? Number(limit) : 10;
      if (isNaN(p) || isNaN(l)) throw new Error('Invalid parameter type');

      pagination.page = p;
      pagination.limit = l;

      return await this.profilesService.findAll(filters, pagination);
    } catch (e: any) {
      if (e.message === 'Unable to interpret query') {
        throw new HttpException({ status: 'error', message: 'Unable to interpret query' }, HttpStatus.BAD_REQUEST);
      }
      if (e.message === 'Invalid parameter type') {
        throw new HttpException({ status: 'error', message: 'Invalid query parameters' }, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      throw new HttpException({ status: 'error', message: e.message || 'Server failure' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
