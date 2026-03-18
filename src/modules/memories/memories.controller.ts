import { Controller, Get, Post, Param, Query, Res, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
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

  @Get('history')
  async getHistory(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    return this.memoriesService.getHistory(limitNum, offsetNum);
  }

  @Get(':id/image')
  async getImage(@Param('id') id: string, @Res() res: Response) {
    const result = await this.memoriesService.getMemorialImage(parseInt(id, 10));
    if (!result) {
      throw new NotFoundException('图片不存在');
    }
    res.set('Content-Type', result.mimeType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(result.buffer);
  }
}
