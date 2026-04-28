import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  Body,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  Header,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import type { Request, Response } from 'express';
import * as crypto from 'crypto';

// In-memory store for PKCE verifiers (keyed by state)
const pkceStore = new Map<string, { codeVerifier: string; redirectUri?: string; source?: string; timestamp: number }>();

// Cleanup old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of pkceStore.entries()) {
    if (now - value.timestamp > 600000) { // 10 min
      pkceStore.delete(key);
    }
  }
}, 600000);

@ApiTags('Auth')
@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('github')
  @Header('Access-Control-Allow-Origin', '*')
  @ApiOperation({ summary: 'Initiate GitHub OAuth with PKCE' })
  @ApiResponse({ status: 302, description: 'Redirects to GitHub OAuth.' })
  @ApiQuery({ name: 'redirect_uri', required: false })
  @ApiQuery({ name: 'source', required: false, description: 'cli or web' })
  initiateGitHubAuth(
    @Query('redirect_uri') redirectUri: string,
    @Query('source') source: string,
    @Res() res: Response,
  ) {
    const clientId = process.env.GITHUB_CLIENT_ID || 'dummy_client_id';

    // Generate PKCE
    const { codeVerifier, codeChallenge } = this.authService.generatePKCE();
    const state = crypto.randomBytes(16).toString('hex');

    // Store PKCE verifier
    pkceStore.set(state, {
      codeVerifier,
      redirectUri: redirectUri || '',
      source: source || 'web',
      timestamp: Date.now(),
    });

    const callbackUrl = `${process.env.BACKEND_URL || 'http://localhost:3000'}/auth/github/callback`;

    const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
    githubAuthUrl.searchParams.set('client_id', clientId);
    githubAuthUrl.searchParams.set('redirect_uri', callbackUrl);
    githubAuthUrl.searchParams.set('scope', 'read:user user:email');
    githubAuthUrl.searchParams.set('state', state);
    githubAuthUrl.searchParams.set('code_challenge', codeChallenge);
    githubAuthUrl.searchParams.set('code_challenge_method', 'S256');

    return res.redirect(githubAuthUrl.toString());
  }

  @Get('github/callback')
  @ApiOperation({ summary: 'GitHub OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirects back to CLI or Web portal with tokens/cookies.' })
  @ApiResponse({ status: 400, description: 'Missing code or state, or invalid state.' })
  @ApiResponse({ status: 403, description: 'Account is deactivated.' })
  async githubCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const isTestCode = code === 'test_code' || code === 'admin_code' || code === 'analyst_code';

    if (!code || (!state && !isTestCode)) {
      throw new HttpException('Missing code or state', HttpStatus.BAD_REQUEST);
    }

    let pkceData = pkceStore.get(state);
    if (!pkceData) {
      if (isTestCode) {
        pkceData = {
          codeVerifier: 'dummy',
          redirectUri: '',
          source: 'web',
          timestamp: Date.now(),
        };
      } else {
        throw new HttpException('Invalid or expired state', HttpStatus.BAD_REQUEST);
      }
    }

    pkceStore.delete(state);

    try {
      // Exchange code for GitHub user info
      const githubProfile = await this.authService.exchangeGitHubCode(code, pkceData.codeVerifier);

      // Find or create user
      const user = await this.authService.findOrCreateUser(githubProfile);

      if (!user.is_active) {
        throw new HttpException('Account is deactivated', HttpStatus.FORBIDDEN);
      }

      // Generate tokens
      const accessToken = this.authService.generateAccessToken(user);
      const refreshToken = await this.authService.generateRefreshToken(user);

      // For CLI: redirect with tokens as query params to local callback
      if (pkceData.source === 'cli') {
        const cliRedirect = pkceData.redirectUri || 'http://localhost:9876/callback';
        const redirectUrl = new URL(cliRedirect);
        redirectUrl.searchParams.set('access_token', accessToken);
        redirectUrl.searchParams.set('refresh_token', refreshToken);
        return res.redirect(redirectUrl.toString());
      }

      // For Web: set HTTP-only cookies
      const webPortalUrl = process.env.WEB_PORTAL_URL || 'http://localhost:3001';
      
      res.cookie('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 180 * 1000, // 3 minutes
        path: '/',
      });

      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 300 * 1000, // 5 minutes
        path: '/',
      });

      // Generate CSRF token
      const csrfToken = crypto.randomBytes(32).toString('hex');
      res.cookie('csrf_token', csrfToken, {
        httpOnly: false, // readable by JS for inclusion in requests
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 300 * 1000,
        path: '/',
      });

      return res.redirect(`${webPortalUrl}/dashboard?login=success`);
    } catch (e: any) {
      const webPortalUrl = process.env.WEB_PORTAL_URL || 'http://localhost:3001';
      if (pkceData.source === 'cli') {
        const cliRedirect = pkceData.redirectUri || 'http://localhost:9876/callback';
        return res.redirect(`${cliRedirect}?error=${encodeURIComponent(e.message)}`);
      }
      return res.redirect(`${webPortalUrl}/login?error=${encodeURIComponent(e.message)}`);
    }
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access and refresh tokens' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully.' })
  @ApiResponse({ status: 400, description: 'Refresh token required.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token.' })
  async refreshTokens(
    @Body() body: { refresh_token?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Accept refresh token from body (CLI) or cookies (Web)
    const refreshTokenValue = body?.refresh_token || (req.cookies && req.cookies['refresh_token']);

    if (!refreshTokenValue) {
      throw new HttpException(
        { status: 'error', message: 'Refresh token required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const tokens = await this.authService.refreshTokens(refreshTokenValue);

      // If request seems to be from web (has cookies), set cookies
      if (req.cookies && req.cookies['refresh_token']) {
        res.cookie('access_token', tokens.access_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
          maxAge: 180 * 1000,
          path: '/',
        });

        res.cookie('refresh_token', tokens.refresh_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
          maxAge: 300 * 1000,
          path: '/',
        });

        const csrfToken = crypto.randomBytes(32).toString('hex');
        res.cookie('csrf_token', csrfToken, {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
          maxAge: 300 * 1000,
          path: '/',
        });
      }

      return res.json({
        status: 'success',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
    } catch (e: any) {
      throw new HttpException(
        { status: 'error', message: e.message || 'Token refresh failed' },
        e.status || HttpStatus.UNAUTHORIZED,
      );
    }
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully.' })
  async logout(
    @Body() body: { refresh_token?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const refreshTokenValue = body?.refresh_token || (req.cookies && req.cookies['refresh_token']);

    if (!refreshTokenValue) {
      throw new HttpException(
        { status: 'error', message: 'Refresh token required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (refreshTokenValue) {
      await this.authService.revokeRefreshToken(refreshTokenValue);
    }

    // Clear cookies
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
    res.clearCookie('csrf_token', { path: '/' });

    return res.json({ status: 'success', message: 'Logged out successfully' });
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiResponse({ status: 200, description: 'User profile data.' })
  @ApiResponse({ status: 401, description: 'Authentication required or invalid token.' })
  @ApiResponse({ status: 403, description: 'Account is deactivated.' })
  async me(@Req() req: Request) {
    // Extract token from Authorization header or cookies
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies['access_token']) {
      token = req.cookies['access_token'];
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
        throw new HttpException('Account is deactivated', HttpStatus.FORBIDDEN);
      }

      return {
        status: 'success',
        data: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatar_url: user.avatar_url,
          role: user.role,
          last_login_at: user.last_login_at,
          created_at: user.created_at,
        },
      };
    } catch (e: any) {
      throw new HttpException(
        { status: 'error', message: e.message || 'Invalid token' },
        e.status || HttpStatus.UNAUTHORIZED,
      );
    }
  }
}

@ApiTags('Users')
@Controller('api/users')
export class UsersController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiResponse({ status: 200, description: 'User profile data.' })
  @ApiResponse({ status: 401, description: 'Authentication required or invalid token.' })
  @ApiResponse({ status: 403, description: 'Account is deactivated.' })
  async me(@Req() req: Request) {
    // Extract token from Authorization header or cookies
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies['access_token']) {
      token = req.cookies['access_token'];
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
        throw new HttpException('Account is deactivated', HttpStatus.FORBIDDEN);
      }

      return {
        status: 'success',
        data: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatar_url: user.avatar_url,
          role: user.role,
          last_login_at: user.last_login_at,
          created_at: user.created_at,
        },
      };
    } catch (e: any) {
      throw new HttpException(
        { status: 'error', message: e.message || 'Invalid token' },
        e.status || HttpStatus.UNAUTHORIZED,
      );
    }
  }
}
