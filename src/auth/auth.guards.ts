import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  applyDecorators,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '../users/user.entity';

// ==================== DECORATORS ====================

/**
 * Sets required roles on a route handler.
 * Usage: @Roles(UserRole.OWNER, UserRole.MANAGER)
 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Extracts the current user from the request.
 * Usage: @CurrentUser() user: User
 */
import { createParamDecorator } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

// ==================== GUARDS ====================

/**
 * Ensures the user has one of the required roles.
 * Must be used AFTER the JwtAuthGuard (needs req.user).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles specified, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user.role);
  }
}

// ==================== COMBINED DECORATORS ====================

/**
 * Protects a route — requires valid JWT.
 * Usage: @Auth()
 */
export function Auth() {
  return applyDecorators(UseGuards(AuthGuard('jwt'), RolesGuard));
}

/**
 * Protects a route — requires valid JWT AND one of the specified roles.
 * Usage: @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
 */
export function AuthRoles(...roles: UserRole[]) {
  return applyDecorators(
    Roles(...roles),
    UseGuards(AuthGuard('jwt'), RolesGuard),
  );
}
