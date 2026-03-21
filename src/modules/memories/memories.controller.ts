import { Controller, Get, Post, Param, Query, Res, Sse, NotFoundException, MessageEvent } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { Observable, map } from 'rxjs';
import { MemoriesService } from './memories.service';
import { HistoryQueryDto } from './dto/memories.dto';

@ApiTags('memories')
@Controller('api/memories')
export class MemoriesController {
  constructor(private readonly memoriesService: MemoriesService) {}

  @ApiOperation({ summary: '获取今日纪念元数据' })
  @Get('today')
  async getToday() {
    return this.memoriesService.getTodayMemorial();
  }

  @ApiOperation({ summary: '重新生成今日纪念' })
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  @Post('regenerate')
  async regenerate() {
    return this.memoriesService.regenerate();
  }

  @ApiOperation({ summary: 'SSE 实时进度推送' })
  @Sse('progress')
  progress(): Observable<MessageEvent> {
    return this.memoriesService.progress$.pipe(
      map((event) => ({ data: event }) as MessageEvent),
    );
  }

  @ApiOperation({ summary: '获取今日纪念卡片图片' })
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

  @ApiOperation({ summary: '获取历史纪念记录' })
  @Get('history')
  async getHistory(@Query() query: HistoryQueryDto) {
    return this.memoriesService.getHistory(query.limit ?? 10, query.offset ?? 0);
  }

  @ApiOperation({ summary: '获取指定纪念卡片图片' })
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
