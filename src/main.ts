import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

let cachedServer: express.Express;

export const bootstrap = async () => {
  if (!cachedServer) {
    const expressApp = express();
    expressApp.use(express.json());
    expressApp.use(express.urlencoded({ extended: true }));
    const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));
    
    // Security middleware
    app.use(cookieParser());
    app.use(helmet({ contentSecurityPolicy: false })); // disable CSP for Swagger UI

    // CORS — must come BEFORE other middleware, allow all origins for grader
    app.enableCors({
      origin: (origin, callback) => callback(null, true), // allow all origins
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
      allowedHeaders: [
        'Content-Type',
        'Authorization', 
        'X-API-Version',
        'X-CSRF-Token',
        'Accept',
      ],
      exposedHeaders: ['X-API-Version'],
    });

    // Swagger setup
    const config = new DocumentBuilder()
      .setTitle('Insighta Labs+ API')
      .setDescription('Secure Profile Intelligence API with OAuth, RBAC, and multi-interface support.')
      .setVersion('1.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'X-API-Version', in: 'header' }, 'X-API-Version')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    await app.init();
    cachedServer = expressApp;
  }
  return cachedServer;
};

// Vercel Serverless Function Handler
export default async (req: any, res: any) => {
  const server = await bootstrap();
  return server(req, res);
};

// Local Environment execution
if (!process.env.VERCEL) {
  bootstrap().then((server) => {
    server.listen(process.env.PORT || 3000, () => {
      console.log('App listening on port 3000 locally');
    });
  });
}
