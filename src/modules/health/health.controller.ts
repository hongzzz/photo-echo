import { Controller, Get } from '@nestjs/common';
import { MemoriesService } from '../memories/memories.service';

@Controller('health')
export class HealthController {
  constructor(private memoriesService: MemoriesService) {}

  @Get()
  async check() {
    const today = new Date().toISOString().split('T')[0];
    const todayMemorial = await this.memoriesService.getTodayMemorial();

    return {
      status: 'ok',
      date: today,
      hasImage: todayMemorial.success,
    };
  }
}
