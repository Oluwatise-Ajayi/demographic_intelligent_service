import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  HttpException,
  HttpStatus,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { ApiQuery, ApiOperation, ApiBody, ApiHeader, ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ProfilesService, ProfileFilters, PaginationAndSort } from './profiles.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { ApiVersionGuard } from '../guards/api-version.guard';
import type { Request, Response } from 'express';

@ApiTags('Profiles')
@ApiBearerAuth()
@Controller('api/profiles')
@UseGuards(JwtAuthGuard, RolesGuard, ApiVersionGuard)
@ApiHeader({ name: 'X-API-Version', required: true, description: 'API version (must be 1)' })
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create a new profile by name (admin only)' })
  @ApiResponse({ status: 201, description: 'The profile has been successfully created.' })
  @ApiResponse({ status: 400, description: 'Name is required.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiBody({ description: 'Name to create profile for', schema: { type: 'object', properties: { name: { type: 'string' } } } })
  async createProfile(@Body() data: { name: string }) {
    if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
      throw new HttpException(
        { status: 'error', message: 'Name is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const profile = await this.profilesService.createProfileFromName(data.name.trim());
      return {
        status: 'success',
        data: profile,
      };
    } catch (e: any) {
      throw new HttpException(
        { status: 'error', message: e.message || 'Server failure' },
        e.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete()
  @Roles('admin')
  @ApiOperation({ summary: 'Delete all profiles (admin only)' })
  @ApiResponse({ status: 200, description: 'All profiles deleted.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async deleteAllProfiles() {
    try {
      await this.profilesService.deleteAll();
      return { status: 'success', message: 'All profiles deleted' };
    } catch (e: any) {
      throw new HttpException(
        { status: 'error', message: e.message || 'Server failure' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('search')
  @Roles('admin', 'analyst')
  @ApiOperation({ summary: 'Search profiles using Natural Language Querying' })
  @ApiResponse({ status: 200, description: 'Search results returned successfully.' })
  @ApiResponse({ status: 400, description: 'Unable to interpret query.' })
  @ApiQuery({ name: 'q', required: true, type: String, example: 'young males from nigeria' })
  @ApiQuery({ name: 'page', required: false, type: String, example: '1' })
  @ApiQuery({ name: 'limit', required: false, type: String, example: '10' })
  async searchProfiles(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Req() req?: Request,
  ) {
    if (!q || String(q).trim() === '') {
      throw new HttpException(
        { status: 'error', message: 'Unable to interpret query' },
        HttpStatus.BAD_REQUEST,
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

      return await this.profilesService.findAll(filters, pagination, '/api/profiles/search', { q: String(q) });
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

  @Get('export')
  @Roles('admin', 'analyst')
  @ApiOperation({ summary: 'Export profiles as CSV' })
  @ApiResponse({ status: 200, description: 'CSV file.' })
  @ApiResponse({ status: 400, description: 'Only CSV format is supported.' })
  @ApiQuery({ name: 'format', required: true, enum: ['csv'] })
  @ApiQuery({ name: 'gender', required: false, type: String })
  @ApiQuery({ name: 'age_group', required: false, type: String })
  @ApiQuery({ name: 'country_id', required: false, type: String })
  @ApiQuery({ name: 'min_age', required: false, type: String })
  @ApiQuery({ name: 'max_age', required: false, type: String })
  @ApiQuery({ name: 'sort_by', required: false, enum: ['age', 'created_at', 'gender_probability'] })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  async exportProfiles(
    @Query('format') format: string,
    @Query('gender') gender?: string,
    @Query('age_group') age_group?: string,
    @Query('country_id') country_id?: string,
    @Query('min_age') min_age?: string,
    @Query('max_age') max_age?: string,
    @Query('sort_by') sort_by?: string,
    @Query('order') order?: string,
    @Res() res?: Response,
  ) {
    if (format !== 'csv') {
      throw new HttpException(
        { status: 'error', message: 'Only CSV format is supported' },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const filters: ProfileFilters = {};
      if (gender) filters.gender = gender;
      if (age_group) filters.age_group = age_group;
      if (country_id) filters.country_id = country_id;
      if (min_age) filters.min_age = Number(min_age);
      if (max_age) filters.max_age = Number(max_age);

      const sortConfig = {
        sort_by: sort_by as any,
        order: order as any,
      };

      const csv = await this.profilesService.exportCSV(filters, sortConfig);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      res!.setHeader('Content-Type', 'text/csv');
      res!.setHeader('Content-Disposition', `attachment; filename="profiles_${timestamp}.csv"`);
      return res!.send(csv);
    } catch (e: any) {
      throw new HttpException(
        { status: 'error', message: e.message || 'Export failed' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  @Roles('admin', 'analyst')
  @ApiOperation({ summary: 'Get a single profile by ID' })
  @ApiResponse({ status: 200, description: 'The profile was found.' })
  @ApiResponse({ status: 404, description: 'Profile not found.' })
  async getProfileById(@Param('id') id: string) {
    try {
      const profile = await this.profilesService.findById(id);
      if (!profile) {
        throw new HttpException(
          { status: 'error', message: 'Profile not found' },
          HttpStatus.NOT_FOUND,
        );
      }
      return { status: 'success', data: profile };
    } catch (e: any) {
      if (e.status === 404) throw e;
      throw new HttpException(
        { status: 'error', message: e.message || 'Server failure' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  @Roles('admin', 'analyst')
  @ApiOperation({ summary: 'Get all profiles with filtering, sorting and pagination' })
  @ApiResponse({ status: 200, description: 'Profiles returned successfully.' })
  @ApiQuery({ name: 'gender', required: false, type: String })
  @ApiQuery({ name: 'age_group', required: false, type: String, description: 'child, teenager, adult, senior' })
  @ApiQuery({ name: 'country_id', required: false, type: String, description: 'ISO code e.g., NG' })
  @ApiQuery({ name: 'min_age', required: false, type: String })
  @ApiQuery({ name: 'max_age', required: false, type: String })
  @ApiQuery({ name: 'min_gender_probability', required: false, type: String })
  @ApiQuery({ name: 'min_country_probability', required: false, type: String })
  @ApiQuery({ name: 'sort_by', required: false, enum: ['age', 'created_at', 'gender_probability'] })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'page', required: false, type: String, example: '1' })
  @ApiQuery({ name: 'limit', required: false, type: String, example: '10' })
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

      // Build extra query params for links
      const extraParams: Record<string, string> = {};
      if (gender) extraParams.gender = gender;
      if (age_group) extraParams.age_group = age_group;
      if (country_id) extraParams.country_id = country_id;
      if (min_age) extraParams.min_age = min_age;
      if (max_age) extraParams.max_age = max_age;
      if (min_gender_probability) extraParams.min_gender_probability = min_gender_probability;
      if (min_country_probability) extraParams.min_country_probability = min_country_probability;
      if (sort_by) extraParams.sort_by = sort_by;
      if (order) extraParams.order = order;

      return await this.profilesService.findAll(filters, pagination, '/api/profiles', extraParams);
    } catch (e: any) {
      if (e.message === 'Invalid parameter type') {
        throw new HttpException({ status: 'error', message: 'Invalid query parameters' }, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      throw new HttpException({ status: 'error', message: e.message || 'Server failure' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
