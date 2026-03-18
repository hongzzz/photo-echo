import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MemoriesService } from './memories.service';

@Injectable()
export class MemoriesScheduler {
  private readonly logger = new Logger(MemoriesScheduler.name);
  private isProcessing = false;

  constructor(private memoriesService: MemoriesService) {}

  // 每天凌晨 4 点执行
  @Cron('0 4 * * *')
  async handleCron() {
    if (this.isProcessing) {
      this.logger.log('上次任务尚未完成，跳过本次执行');
      return;
    }

    this.logger.log('定时任务触发：开始处理今日回忆');
    this.isProcessing = true;

    try {
      await this.memoriesService.processMemories();
    } catch (error) {
      this.logger.error('定时任务执行失败', error);
    } finally {
      this.isProcessing = false;
    }
  }
}
