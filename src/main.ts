import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // rawBody: true makes NestJS preserve req.rawBody for Stripe webhook verification.
  // We use NestExpressApplication so we can call useBodyParser() to raise the
  // size limit to 15MB (needed for base64 image uploads) WITHOUT breaking rawBody.
  // Using app.use(express.json()) separately would consume the stream and lose rawBody.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Raise body size limit to 15MB while preserving rawBody for Stripe webhooks.
  app.useBodyParser('json', { limit: '15mb' });
  app.useBodyParser('urlencoded', { limit: '15mb', extended: true });

  // Global prefix — all routes start with /api
  app.setGlobalPrefix('api');

  // Validation — automatically validates DTOs using class-validator decorators
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — allow mobile app and admin dashboard to connect
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:8081',
      'http://localhost:19006',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Health check endpoint (outside /api prefix)
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (req: any, res: any) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.APP_ENV || 'development',
    });
  });

  // Start the server
  const configService = app.get(ConfigService);
  const port = process.env.PORT || configService.get<number>('APP_PORT', 3000);

  await app.listen(port);
  logger.log(`====================================`);
  logger.log(`  Fun Pizza Kitchen API`);
  logger.log(`  Running on: http://localhost:${port}`);
  logger.log(`  API base:   http://localhost:${port}/api`);
  logger.log(`  Health:     http://localhost:${port}/health`);
  logger.log(`  Environment: ${configService.get('APP_ENV', 'development')}`);
  logger.log(`====================================`);
}

bootstrap();
