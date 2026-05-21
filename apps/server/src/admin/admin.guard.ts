import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { AuthService } from "./auth.service";

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      cookies?: Record<string, string | undefined>;
      adminUser?: unknown;
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

    request.adminUser = user;
    return true;
  }
}
