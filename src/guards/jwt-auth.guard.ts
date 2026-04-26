import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
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
      throw new UnauthorizedException('Authentication required');
    }

    try {
      const payload = this.authService.verifyAccessToken(token);
      const user = await this.authService.getUserById(payload.sub);

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      if (!user.is_active) {
        throw new ForbiddenException('Account is deactivated');
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
      if (e instanceof ForbiddenException) {
        throw e;
      }
      throw new UnauthorizedException(e.message || 'Invalid token');
    }
  }
}
