import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfilesModule } from './profiles/profiles.module';
import { Profile } from './profiles/profile.entity';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import * as path from 'path';

// Vercel serverless functions have a read-only filesystem except for /tmp.
// So if we are running in production on Vercel, we MUST use /tmp as the SQLite DB path.
const isVercel = process.env.VERCEL === '1';
const dbPath = isVercel ? '/tmp/database.sqlite' : path.join(process.cwd(), 'database.sqlite');

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: dbPath,
      entities: [Profile],
      synchronize: true, // Will auto create schema. Very useful on Vercel cold starts.
    }),
    ProfilesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
