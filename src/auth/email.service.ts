import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey: string;
  private readonly domain: string;
  private readonly fromEmail: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('MAILGUN_API_KEY', '');
    this.domain = this.configService.get<string>('MAILGUN_DOMAIN', '');
    this.fromEmail = this.configService.get<string>('MAILGUN_FROM_EMAIL', 'verify@funpizzakitchen.com');
  }

  async sendOTP(to: string, code: string): Promise<boolean> {
    if (!this.apiKey || !this.domain) {
      this.logger.warn('Mailgun not configured — OTP not sent. Set MAILGUN_API_KEY and MAILGUN_DOMAIN in .env');
      this.logger.log('OTP for ' + to + ': ' + code + ' (logged because email not configured)');
      return true; // Return true so dev flow isn't blocked
    }

    try {
      await this.sendMailgunEmail(to, code);
      this.logger.log('OTP email sent to ' + to);
      return true;
    } catch (error) {
      this.logger.error('Failed to send OTP to ' + to + ': ' + error.message);
      return false;
    }
  }

  private sendMailgunEmail(to: string, code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const formData = [
        'from=' + encodeURIComponent('"Fun Pizza Kitchen" <' + this.fromEmail + '>'),
        'to=' + encodeURIComponent(to),
        'subject=' + encodeURIComponent('Your Fun Pizza Kitchen Verification Code'),
        'html=' + encodeURIComponent(this.getOTPTemplate(code)),
      ].join('&');

      const auth = Buffer.from('api:' + this.apiKey).toString('base64');

      const options = {
        hostname: 'api.mailgun.net',
        port: 443,
        path: '/v3/' + this.domain + '/messages',
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + auth,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(formData),
        },
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          if ((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300) {
            resolve();
          } else {
            reject(new Error('Mailgun API error ' + res.statusCode + ': ' + body));
          }
        });
      });

      req.on('error', reject);
      req.write(formData);
      req.end();
    });
  }

  private getOTPTemplate(code: string): string {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #F8F6F3;">
      <div style="background: #1C1612; border-radius: 16px; padding: 32px; text-align: center; margin-bottom: 24px;">
        <h1 style="color: #C8922A; font-size: 28px; margin: 0; letter-spacing: 3px;">FUN</h1>
        <p style="color: #F5EDE0; font-size: 14px; margin: 4px 0 0; letter-spacing: 5px;">PIZZA KITCHEN</p>
      </div>
      <div style="background: #FFFFFF; border-radius: 16px; padding: 32px; text-align: center;">
        <h2 style="color: #1C1612; font-size: 20px; margin: 0 0 8px;">Verify Your Email</h2>
        <p style="color: #6B5E52; font-size: 14px; margin: 0 0 24px; line-height: 1.5;">Enter this code in the app to verify your account.</p>
        <div style="background: #F8F6F3; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <span style="font-size: 36px; font-weight: 800; color: #1C1612; letter-spacing: 8px;">${code}</span>
        </div>
        <p style="color: #A69A8E; font-size: 12px; margin: 0;">This code expires in 10 minutes. Don't share it with anyone.</p>
      </div>
      <p style="color: #A69A8E; font-size: 11px; text-align: center; margin-top: 24px;">Fun Pizza Kitchen Drinks Membership</p>
    </div>
    `;
  }
}
