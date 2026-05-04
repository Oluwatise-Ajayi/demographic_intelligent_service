import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Profile } from './profile.entity';
import { ProfilesService } from './profiles.service';
import { ProfilesController } from './profiles.controller';
import { SeederService } from './seeder.service';
import { QueryParserService } from './query-parser.service';
import { CsvIngestionService } from './csv-ingestion.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Profile]),
    AuthModule, // Required for JwtAuthGuard to inject AuthService
  ],
  controllers: [ProfilesController],
  providers: [ProfilesService, SeederService, QueryParserService, CsvIngestionService],
})
export class ProfilesModule implements OnModuleInit {
  constructor(private readonly seederService: SeederService) {}

  async onModuleInit() {
    await this.seederService.seedDatabase();
  }
}
