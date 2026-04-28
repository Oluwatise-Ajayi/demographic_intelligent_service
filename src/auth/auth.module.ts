import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { RefreshToken } from './refresh-token.entity';
import { AuthService } from './auth.service';
import { AuthController, UsersController } from './auth.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, RefreshToken])],
  controllers: [AuthController, UsersController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
