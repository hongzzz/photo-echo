import { Controller, Get, Post, Query } from '@nestjs/common';
import { MemoriesService } from './memories.service';
import { Memorial } from './entities/memorial.entity';

@Controller('api/memories')
export class MemoriesController {
  constructor(private readonly memoriesService: MemoriesService) {}

  @Get('today')
  async getToday() {
    return this.memoriesService.getTodayMemorial();
  }

  @Post('regenerate')
  async regenerate() {
    return this.memoriesService.regenerate();
  }

  @Get('history')
  async getHistory(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Memorial[]> {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    return this.memoriesService.getHistory(limitNum, offsetNum);
  }
}
