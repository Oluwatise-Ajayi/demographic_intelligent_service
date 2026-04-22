import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from './profile.entity';
import { randomUUID } from 'crypto';
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

    // Try multiple possible locations for data.json
    const possiblePaths = [
      path.join(process.cwd(), 'data.json'),
      path.join(__dirname, '..', '..', 'data.json'),
      '/var/task/data.json',
      '/var/task/src/data.json',
    ];

    let seedFilePath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        seedFilePath = p;
        break;
      }
    }

    if (seedFilePath) {
      try {
        const rawData = fs.readFileSync(seedFilePath, 'utf8');
        const parsed = JSON.parse(rawData);
        const items = Array.isArray(parsed) ? parsed : parsed.profiles || [];
        
        const mappedItems = items.map(item => ({
          ...item,
          id: item.id || randomUUID(),
        }));
        
        await this.profileRepository.save(mappedItems, { chunk: 100 });
        this.logger.log(`Successfully seeded ${mappedItems.length} records from ${seedFilePath}`);
      } catch (e) {
        this.logger.error(`Failed to seed data: ${e.message}`);
      }
    } else {
      this.logger.warn('Seed data file not found in any known location.');
    }
  }
}
