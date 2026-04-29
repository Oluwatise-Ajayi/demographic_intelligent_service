import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ProfilesModule } from './profiles/profiles.module';
import { AuthModule } from './auth/auth.module';
import { Profile } from './profiles/profile.entity';
import { User } from './auth/user.entity';
import { RefreshToken } from './auth/refresh-token.entity';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';
import { ConfigModule } from '@nestjs/config';
import { HttpException, HttpStatus, Injectable, ExecutionContext } from '@nestjs/common';

// Custom ThrottlerGuard to return proper error format
@Injectable()
class CustomThrottlerGuard extends ThrottlerGuard {
  protected throwThrottlingException(context: ExecutionContext): Promise<void> {
    throw new HttpException(
      { status: 'error', message: 'Too Many Requests' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
      entities: [Profile, User, RefreshToken],
      synchronize: true,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 60000,
        limit: 10,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 60,
      },
    ]),
    AuthModule,
    ProfilesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
