import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { MemoriesService } from './memories.service';

@Injectable()
export class MemoriesScheduler implements OnModuleInit {
  private readonly logger = new Logger(MemoriesScheduler.name);
  private isProcessing = false;

  constructor(
    private memoriesService: MemoriesService,
    private configService: ConfigService,
    private schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit() {
    const cronSchedule = this.configService.get<string>('app.system.cronSchedule') || '0 4 * * *';
    const job = new CronJob(cronSchedule, () => this.handleCron());
    this.schedulerRegistry.addCronJob('memories-daily', job);
    job.start();
    this.logger.log(`定时任务已注册，cron: ${cronSchedule}`);
  }

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
