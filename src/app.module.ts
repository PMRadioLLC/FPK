import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { VerificationModule } from './verification/verification.module';
import { MembershipsModule } from './memberships/memberships.module';
import { BarcodeModule } from './barcode/barcode.module';
import { DrinksModule } from './drinks/drinks.module';
import { PaymentsModule } from './payments/payments.module';
import { LocationsModule } from './locations/locations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DrinkRequestsModule } from './drink-requests/drink-requests.module';

@Module({
  imports: [
    // ===== CONFIGURATION =====
    // Loads .env file and makes values available via ConfigService
    ConfigModule.forRoot({
      isGlobal: true,         // Available everywhere without importing
      envFilePath: '.env',
    }),

    // ===== DATABASE =====
    // PostgreSQL connection via TypeORM
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'postgres'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.get<string>('DB_DATABASE', 'postgres'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        // synchronize creates all tables automatically on boot.
        // Set to true ONLY for initial Supabase setup, then back to false.
        synchronize: config.get<string>('DB_SYNCHRONIZE') === 'true',
        ssl: config.get<string>('DB_SSL') === 'true'
          ? { rejectUnauthorized: false }
          : false,
        logging: config.get<string>('APP_ENV') === 'development',
      }),
    }),

    // ===== FEATURE MODULES =====
    AuthModule,             // Firebase auth + JWT + guards
    UsersModule,            // User profiles + admin user management
    VerificationModule,     // ID verification flow
    MembershipsModule,      // Membership plans + subscriptions
    BarcodeModule,          // TOTP barcode generation + validation
    DrinksModule,           // Drink menu + logs + limits
    PaymentsModule,         // Stripe + cash payments + promo codes
    LocationsModule,        // Multi-location + staff assignments
    NotificationsModule,    // Expo push token registration + delivery
    DrinkRequestsModule,    // Member drink requests + staff acceptance
  ],
})
export class AppModule {}
