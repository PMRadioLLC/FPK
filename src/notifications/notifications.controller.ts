import { Controller, Post, Delete, Body } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Auth, CurrentUser } from '../auth/auth.guards';
import { User } from '../users/user.entity';

@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Post('token')
  @Auth()
  registerToken(@CurrentUser() user: User, @Body('token') token: string) {
    return this.notificationsService.registerToken(user.id, token);
  }

  @Delete('token')
  @Auth()
  removeToken(@CurrentUser() user: User, @Body('token') token: string) {
    return this.notificationsService.removeToken(user.id, token);
  }
}
