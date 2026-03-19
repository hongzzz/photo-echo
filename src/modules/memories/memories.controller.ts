import { Controller, Get, Post, Param, Query, Res, Sse, NotFoundException, MessageEvent } from '@nestjs/common';
import { Response } from 'express';
import { Observable, map } from 'rxjs';
import { MemoriesService } from './memories.service';

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

  @Sse('progress')
  progress(): Observable<MessageEvent> {
    return this.memoriesService.progress$.pipe(
      map((event) => ({ data: event }) as MessageEvent),
    );
  }

  @Get('today/image')
  async getTodayImage(@Res() res: Response) {
    const result = await this.memoriesService.getTodayImage();
    if (!result) {
      throw new NotFoundException('今日纪念图片尚未生成');
    }
    res.set('Content-Type', result.mimeType);
    res.set('Cache-Control', 'no-cache');
    res.send(result.buffer);
  }

  @Get('history')
  async getHistory(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);
    return this.memoriesService.getHistory(limitNum, offsetNum);
  }

  @Get('image/:id')
  async getImage(@Param('id') id: string, @Res() res: Response) {
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      throw new NotFoundException('无效的 ID');
    }
    const result = await this.memoriesService.getMemorialImage(numId);
    if (!result) {
      throw new NotFoundException('图片不存在');
    }
    res.set('Content-Type', result.mimeType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(result.buffer);
  }
}
