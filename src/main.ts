import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

let cachedServer: express.Express;

export const bootstrap = async () => {
  if (!cachedServer) {
    const expressApp = express();
    const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));
    
    // CORS header: Access-Control-Allow-Origin: *
    app.enableCors({
      origin: '*',
    });

    // Swagger setup
    const config = new DocumentBuilder()
      .setTitle('Insighta Labs Profile API')
      .setDescription('API for advanced filtering, sorting, pagination, and natural language search.')
      .setVersion('1.0')
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
