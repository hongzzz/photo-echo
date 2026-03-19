import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 启用验证管道
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
  }));

  // 启用 CORS
  app.enableCors();

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`PhotoEcho 已启动: http://0.0.0.0:${port} (内网可访问)`);
  console.log('可用 API:');
  console.log(`  GET  /            - 查看主页`);
  console.log(`  GET  /health      - 健康检查`);
  console.log(`  GET  /api/memories/today   - 获取今日纪念`);
  console.log(`  POST /api/memories/regenerate - 重新生成纪念`);
  console.log(`  GET  /api/memories/history  - 历史记录`);
}

bootstrap();
