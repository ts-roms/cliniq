import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app/app.module.js';

async function bootstrap() {
  // Same posture as the api's superuser refusal: a production ai-service
  // with no shared secret is an open Bedrock proxy. Fail loudly at boot
  // rather than quietly serving anyone who finds the port.
  if (process.env.NODE_ENV === 'production' && !process.env.AI_SERVICE_TOKEN) {
    Logger.error(
      'AI_SERVICE_TOKEN is required when NODE_ENV=production (the api sends it as X-AI-Service-Token).',
      'Bootstrap',
    );
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.use(helmet());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:4000').split(','),
    credentials: true,
  });

  app.setGlobalPrefix('ai');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ClinIQ AI Service')
    .setDescription('Bedrock-backed drafts (SOAP, dermatology, triage)')
    .setVersion(process.env.npm_package_version ?? '0.0.1')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'jwt',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('ai/docs', app, document);

  const port = Number(process.env.PORT) || 4100;
  await app.listen(port);
  Logger.log(`AI service running on http://localhost:${port}/ai`, 'Bootstrap');
  Logger.log(`Swagger UI at http://localhost:${port}/ai/docs`, 'Bootstrap');
}

bootstrap();
