import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from './profile.entity';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import csvParser = require('csv-parser');
import { COUNTRY_MAP, getAgeGroup } from './profiles.constants';

@Injectable()
export class CsvIngestionService {
  constructor(
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
  ) {}

  async processCSV(filePath: string) {
    let total_rows = 0;
    let inserted = 0;
    let skipped = 0;
    const reasons: Record<string, number> = {
      duplicate_name: 0,
      invalid_age: 0,
      missing_fields: 0,
      malformed: 0,
    };

    const stream = fs.createReadStream(filePath).pipe(csvParser());
    
    let batch: any[] = [];
    const batchSize = 1000; // Chunk size for efficiency

    const saveBatch = async (currentBatch: any[]) => {
      const validRows: any[] = [];
      
      for (const row of currentBatch) {
        if (!row.name || !row.gender || row.age === undefined || row.age === '' || !row.country_id) {
          skipped++;
          reasons.missing_fields++;
          continue;
        }
        const age = parseInt(row.age, 10);
        if (isNaN(age) || age < 0) {
          skipped++;
          reasons.invalid_age++;
          continue;
        }
        
        validRows.push({ ...row, age });
      }

      if (validRows.length === 0) return;

      const names = validRows.map((r) => r.name);
      // Fetch existing names in bulk to check for duplicates
      const existing = await this.profileRepository
        .createQueryBuilder('profile')
        .select('profile.name')
        .where('profile.name IN (:...names)', { names })
        .getMany();
      
      const existingNames = new Set(existing.map((e) => e.name));

      const toInsert: Profile[] = [];
      for (const row of validRows) {
        if (existingNames.has(row.name)) {
          skipped++;
          reasons.duplicate_name++;
          continue;
        }
        
        toInsert.push(this.profileRepository.create({
          id: randomUUID(),
          name: row.name,
          gender: String(row.gender).toLowerCase(),
          gender_probability: parseFloat(row.gender_probability) || 1.0,
          age: row.age,
          age_group: row.age_group || getAgeGroup(row.age),
          country_id: String(row.country_id).toUpperCase(),
          country_name: row.country_name || COUNTRY_MAP[String(row.country_id).toUpperCase()] || row.country_id,
          country_probability: parseFloat(row.country_probability) || 1.0,
        }));
      }

      if (toInsert.length > 0) {
        try {
          await this.profileRepository.insert(toInsert);
          inserted += toInsert.length;
        } catch (err) {
          // If bulk insert fails, fallback to row-by-row to prevent total failure
          for (const item of toInsert) {
            try {
              await this.profileRepository.insert(item);
              inserted++;
            } catch (e) {
              skipped++;
              reasons.malformed++;
            }
          }
        }
      }
    };

    try {
      for await (const row of stream) {
        total_rows++;
        batch.push(row);
        if (batch.length >= batchSize) {
          await saveBatch(batch);
          batch = [];
        }
      }
      if (batch.length > 0) {
        await saveBatch(batch);
      }
    } finally {
      // Clean up the uploaded file to free disk space
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        // ignore
      }
    }

    // Clean up empty reasons
    for (const key of Object.keys(reasons)) {
      if (reasons[key] === 0) {
        delete reasons[key];
      }
    }

    return {
      status: 'success',
      total_rows,
      inserted,
      skipped,
      reasons,
    };
  }
}
