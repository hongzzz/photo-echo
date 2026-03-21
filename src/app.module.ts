import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';

import configuration from './config/configuration';
import { AppController } from './app.controller';
import { MemoriesModule } from './modules/memories/memories.module';
import { ImmichModule } from './modules/immich/immich.module';
import { OllamaModule } from './modules/ollama/ollama.module';
import { ImageProcessorModule } from './modules/image-processor/image-processor.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // 配置模块 - 加载 .env 文件
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),

    // 定时任务模块
    ScheduleModule.forRoot(),

    // 限流
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),

    // 静态文件服务
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'src', 'public'),
      serveRoot: '/',
      exclude: ['/api{*splat}'],
    }),

    // TypeORM + SQLite
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: process.env.DATABASE_PATH || './data/memorials.db',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true,
    }),

    // 业务模块
    MemoriesModule,
    ImmichModule,
    OllamaModule,
    ImageProcessorModule,
    HealthModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
