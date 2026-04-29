import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    let token: string | undefined;

    // Check Authorization header first (CLI)
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    // Fall back to HTTP-only cookie (Web)
    else if (request.cookies && request.cookies['access_token']) {
      token = request.cookies['access_token'];
    }

    if (!token) {
      throw new HttpException(
        { status: 'error', message: 'Authentication required' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      const payload = this.authService.verifyAccessToken(token);
      const user = await this.authService.getUserById(payload.sub);

      if (!user) {
        throw new HttpException(
          { status: 'error', message: 'User not found' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      if (!user.is_active) {
        throw new HttpException(
          { status: 'error', message: 'Account is deactivated' },
          HttpStatus.FORBIDDEN,
        );
      }

      // Attach user to request
      request.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
      };

      return true;
    } catch (e: any) {
      if (e instanceof HttpException) {
        throw e;
      }
      throw new HttpException(
        { status: 'error', message: e.message || 'Invalid token' },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
}
