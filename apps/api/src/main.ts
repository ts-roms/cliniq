import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app/app.module.js';

async function bootstrap() {
  // `rawBody: true` preserves the unparsed buffer on the request object so
  // webhook handlers (e.g. PayMongo HMAC) can verify the signature against
  // the exact bytes the provider signed. JSON-parsed body is still populated
  // alongside it, so existing controllers are unaffected.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  app.use(helmet());
  app.enableCors({
    origin: (
      process.env.CORS_ORIGINS ??
      [
        'http://localhost:3000', // web (Next.js)
        'http://localhost:4200', // legacy nx default
        'http://localhost:4300',
        'http://localhost:8081', // Expo web (default Metro web port)
        'http://localhost:19000', // Expo dev server / web
        'http://localhost:19006', // Expo web (legacy)
      ].join(',')
    ).split(','),
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ClinIQ API')
    .setDescription('Multi-tenant clinic management API')
    .setVersion(process.env.npm_package_version ?? '0.0.1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'jwt')
    .addServer(process.env.PUBLIC_API_URL ?? 'http://localhost:4000')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Emit the spec for codegen consumers (libs/api-client).
  // Honors --emit-openapi to write and exit (used by the generate:api-client script).
  if (process.argv.includes('--emit-openapi') || process.env.EMIT_OPENAPI === '1') {
    const out = resolve(process.cwd(), 'apps/api/openapi.json');
    writeFileSync(out, JSON.stringify(document, null, 2));
    Logger.log(`OpenAPI spec written to ${out}`, 'Bootstrap');
    await app.close();
    process.exit(0);
  }

  const port = Number(process.env.PORT) || 4000;
  await app.listen(port);
  Logger.log(`API running on http://localhost:${port}/api`, 'Bootstrap');
  Logger.log(`Swagger UI at http://localhost:${port}/api/docs`, 'Bootstrap');
}

bootstrap();
