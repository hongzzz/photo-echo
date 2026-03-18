import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Memorial } from './entities/memorial.entity';
import { MemoriesController } from './memories.controller';
import { MemoriesService } from './memories.service';
import { MemoriesScheduler } from './memories.scheduler';

@Module({
  imports: [TypeOrmModule.forFeature([Memorial])],
  controllers: [MemoriesController],
  providers: [MemoriesService, MemoriesScheduler],
  exports: [MemoriesService],
})
export class MemoriesModule {}
