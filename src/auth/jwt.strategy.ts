import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';

export interface JwtPayload {
  sub: string;       // user id
  email: string;
  role: string;
  status: string;
  /**
   * Snapshot of users.token_version at issue time. The strategy compares it
   * against the current value on every request; mismatch = revoked.
   * Optional so legacy tokens (issued before revocation existed) still pass
   * — they're treated as version 0 and stay valid until natural expiry.
   */
  tv?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  /**
   * Called automatically by Passport after verifying the JWT signature.
   * Whatever we return here becomes `req.user` in controllers.
   */
  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.status === 'banned') {
      throw new UnauthorizedException('Account has been banned');
    }
    // Token revocation — if the user's tokenVersion has been bumped since
    // this JWT was issued, reject. Tokens without `tv` are pre-revocation
    // legacy tokens and pass (they expire naturally after 7 days).
    if (payload.tv !== undefined && payload.tv !== user.tokenVersion) {
      throw new UnauthorizedException('Session expired — please sign in again');
    }
    return user;
  }
}
