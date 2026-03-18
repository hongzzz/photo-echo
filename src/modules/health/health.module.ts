import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { MemoriesModule } from '../memories/memories.module';

@Module({
  imports: [MemoriesModule],
  controllers: [HealthController],
})
export class HealthModule {}
