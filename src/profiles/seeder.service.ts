import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from './profile.entity';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SeederService {
  private readonly logger = new Logger(SeederService.name);

  constructor(
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
  ) {}

  async seedDatabase() {
    const count = await this.profileRepository.count();
    if (count > 0) {
      this.logger.log(`Database already has ${count} records. Skipping seed.`);
      return;
    }

    // Try reading seed data if provided
    const seedFilePath = path.join(process.cwd(), 'data.json');
    if (fs.existsSync(seedFilePath)) {
      try {
        const rawData = fs.readFileSync(seedFilePath, 'utf8');
        const parsed = JSON.parse(rawData);
        const items = Array.isArray(parsed) ? parsed : parsed.profiles || [];
        
        const { v7: uuidv7 } = await eval(`import('uuid')`);
        
        const mappedItems = items.map(item => ({
          ...item,
          id: uuidv7(),
        }));
        
        await this.profileRepository.save(mappedItems, { chunk: 100 });
        this.logger.log(`Successfully seeded ${mappedItems.length} records from data.json`);
      } catch (e) {
        this.logger.error(`Failed to seed data: ${e.message}`);
      }
    } else {
      this.logger.warn('Seed data file not found at "data.json". Please provide it.');
    }
  }
}
