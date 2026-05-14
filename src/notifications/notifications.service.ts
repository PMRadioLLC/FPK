import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PushToken } from './push-token.entity';
import { User } from '../users/user.entity';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(PushToken) private tokenRepo: Repository<PushToken>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async registerToken(userId: string, token: string): Promise<void> {
    await this.tokenRepo
      .createQueryBuilder()
      .insert()
      .into(PushToken)
      .values({ userId, token })
      .orIgnore()
      .execute();
  }

  async removeToken(userId: string, token: string): Promise<void> {
    await this.tokenRepo.delete({ userId, token });
  }

  /** Returns all Expo push tokens for staff/managers/owners at a given location */
  async getStaffTokensForLocation(locationId: string): Promise<string[]> {
    const result = await this.tokenRepo.query(
      `SELECT DISTINCT pt.token
       FROM push_tokens pt
       JOIN users u ON u.id = pt.user_id
       WHERE u.role IN ('owner', 'manager', 'staff')
         AND (
           u.role = 'owner'
           OR EXISTS (
             SELECT 1 FROM staff_assignments sa
             WHERE sa.user_id = u.id
               AND sa.location_id = $1
               AND sa.is_active = true
           )
         )`,
      [locationId],
    );
    return result.map((r: any) => r.token);
  }

  async sendPushNotifications(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<void> {
    if (tokens.length === 0) return;

    const messages = tokens.map(to => ({
      to,
      title,
      body,
      sound: 'default',
      priority: 'high',
      channelId: 'drink-requests',
      data: data || {},
    }));

    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      const json = await res.json() as any;
      const errors = (json.data || []).filter((r: any) => r.status === 'error');
      if (errors.length > 0) {
        this.logger.warn(`Push delivery errors: ${JSON.stringify(errors)}`);
      }
    } catch (e) {
      this.logger.error('Failed to send push notifications', e);
    }
  }
}
