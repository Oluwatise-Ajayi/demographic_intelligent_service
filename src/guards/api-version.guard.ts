import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

@Injectable()
export class ApiVersionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiVersion = request.headers['x-api-version'];

    if (!apiVersion) {
      throw new HttpException(
        { status: 'error', message: 'API version header required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    return true;
  }
}
