import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService } from "./auth.service";

export type AdminRoleName = "owner" | "admin" | "editor";

export interface AdminSessionUser {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  role: AdminRoleName;
  createdAt: string;
  updatedAt: string;
}

const ADMIN_ROLES_KEY = "fullfocus:admin-roles";
const ROLE_RANK: Record<AdminRoleName, number> = {
  editor: 0,
  admin: 1,
  owner: 2
};

export const AdminRoles = (...roles: AdminRoleName[]) => SetMetadata(ADMIN_ROLES_KEY, roles);

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      cookies?: Record<string, string | undefined>;
      adminUser?: AdminSessionUser;
    }>();
    const authorization = request.headers.authorization;
    const bearer = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
    const token = bearer ?? request.cookies?.ff_session;

    if (!token) {
      throw new HttpException("Admin session is required", HttpStatus.UNAUTHORIZED);
    }

    const user = await this.auth.getUserFromToken(token);
    if (!user) {
      throw new HttpException("Admin session is invalid", HttpStatus.UNAUTHORIZED);
    }

    const requiredRoles = this.reflector.getAllAndOverride<AdminRoleName[]>(ADMIN_ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (requiredRoles?.length) {
      const minRank = Math.min(...requiredRoles.map((role) => ROLE_RANK[role]));
      if (ROLE_RANK[user.role] < minRank) {
        throw new HttpException("Admin role is not allowed for this action", HttpStatus.FORBIDDEN);
      }
    }

    request.adminUser = user;
    return true;
  }
}
