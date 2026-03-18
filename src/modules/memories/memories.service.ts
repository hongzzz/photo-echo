import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

import { Memorial } from './entities/memorial.entity';
import { ImmichService, Asset } from '../immich/immich.service';
import { OllamaService, MemoryScore } from '../ollama/ollama.service';
import { ImageProcessorService } from '../image-processor/image-processor.service';

interface ProcessedAsset extends Asset {
  tempPath?: string;
  score?: MemoryScore;
}

@Injectable()
export class MemoriesService {
  private readonly logger = new Logger(MemoriesService.name);
  private tempDir: string;

  constructor(
    @InjectRepository(Memorial)
    private memorialRepository: Repository<Memorial>,
    private immichService: ImmichService,
    private ollamaService: OllamaService,
    private imageProcessorService: ImageProcessorService,
    private configService: ConfigService,
  ) {
    this.tempDir = path.join(process.cwd(), '.temp');
    this.ensureTempDir();
  }

  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async processMemories(): Promise<string | null> {
    this.logger.log('='.repeat(50));
    this.logger.log('开始处理今日回忆...');
    this.logger.log('='.repeat(50));

    const today = new Date();
    const todayDate = today.toISOString().split('T')[0];

    try {
      // 1. 获取"历史上的今天"照片
      this.logger.log('\n[1/7] 检索历史上的今天照片...');
      const yearsBack = this.configService.get<number>('app.system.daysLookback') || 5;
      const assets = await this.immichService.getHistoricalPhotos(today, yearsBack);

      if (assets.length === 0) {
        this.logger.log('未找到历史上的今天照片');
        return null;
      }

      this.logger.log(`找到 ${assets.length} 张历史上的今天照片`);

      // 2. 下载照片并用 Moondream 快速筛选
      this.logger.log('\n[2/7] 下载并快速筛选照片...');
      const maxAssets = this.configService.get<number>('app.system.maxAssets') || 50;
      const processedAssets: ProcessedAsset[] = [];

      for (const asset of assets.slice(0, maxAssets)) {
        const tempPath = path.join(this.tempDir, `${asset.id}.jpg`);

        try {
          await this.immichService.getThumbnail(asset.id, tempPath);

          // Moondream 快速筛选：过滤无纪念价值的照片
          const pass = await this.ollamaService.quickScreen(tempPath);
          if (pass) {
            processedAssets.push({ ...asset, tempPath });
            this.logger.debug(`  ✓ ${asset.originalFileName} 通过粗筛`);
          } else {
            this.logger.debug(`  ✗ ${asset.originalFileName} 未通过粗筛`);
            fs.unlinkSync(tempPath);
          }
        } catch (error) {
          this.logger.error(`处理图片 ${asset.id} 失败`, error);
        }
      }

      if (processedAssets.length === 0) {
        this.logger.log('没有通过筛选的照片');
        return null;
      }

      this.logger.log(`通过粗筛 ${processedAssets.length}/${Math.min(assets.length, maxAssets)} 张照片`);

      // 3. 深度评分和选择
      this.logger.log('\n[3/7] 深度评分...');
      let bestAsset: ProcessedAsset | null = null;
      let bestScore = 0;

      for (const asset of processedAssets) {
        if (asset.tempPath) {
          const score = await this.ollamaService.deepScoreMemoryValue(asset.tempPath);
          asset.score = score;

          this.logger.log(`  - ${asset.originalFileName}: ${score.overall}/10`);

          if (score.overall > bestScore) {
            bestScore = score.overall;
            bestAsset = asset;
          }
        }
      }

      if (!bestAsset || !bestAsset.tempPath) {
        this.logger.log('未能选择最佳照片');
        return null;
      }

      this.logger.log(`\n最佳照片: ${bestAsset.originalFileName} (${bestScore}/10)`);

      // 4. 生成纪念文案
      this.logger.log('\n[4/7] 生成纪念文案...');
      const stylePreference = this.configService.get<string>('app.system.stylePreference') || 'classical';
      const captionResult = await this.ollamaService.generateCaption(
        bestAsset.tempPath,
        stylePreference
      );

      this.logger.log(`生成的文案: ${captionResult.caption}`);

      // 5. 合成纪念图片
      this.logger.log('\n[5/7] 合成纪念图片...');
      const outputDir = this.configService.get<string>('app.system.outputDir') || './output';
      const outputPath = path.join(outputDir, `memorial_${todayDate}.jpg`);

      const finalPath = await this.imageProcessorService.createMemorialCardWithDate(
        bestAsset.tempPath,
        captionResult.caption,
        today,
        stylePreference,
        outputPath
      );

      this.logger.log(`纪念图片已保存: ${finalPath}`);

      // 6. 清理临时文件
      this.logger.log('\n[6/7] 清理临时文件...');
      for (const asset of processedAssets) {
        if (asset.tempPath && fs.existsSync(asset.tempPath)) {
          fs.unlinkSync(asset.tempPath);
        }
      }

      // 7. 保存到数据库
      this.logger.log('\n[7/7] 保存到数据库...');
      const memorial = this.memorialRepository.create({
        date: todayDate,
        imagePath: finalPath,
        caption: captionResult.caption,
        sourceAssetId: bestAsset.id,
        sourceFileName: bestAsset.originalFileName,
        score: bestScore,
        style: stylePreference,
      });

      await this.memorialRepository.save(memorial);

      this.logger.log('\n' + '='.repeat(50));
      this.logger.log('处理完成!');
      this.logger.log('='.repeat(50));

      return finalPath;
    } catch (error) {
      this.logger.error('处理失败', error);
      return null;
    }
  }

  async getTodayMemorial(): Promise<{ success: boolean; date?: string; image?: string; filename?: string; message?: string }> {
    const today = new Date().toISOString().split('T')[0];

    const memorial = await this.memorialRepository.findOne({
      where: { date: today },
      order: { createdAt: 'DESC' },
    });

    if (memorial && fs.existsSync(memorial.imagePath)) {
      const imageBuffer = fs.readFileSync(memorial.imagePath);
      const base64 = imageBuffer.toString('base64');
      const ext = path.extname(memorial.imagePath).slice(1);
      const mimeType = ext === 'jpg' ? 'jpeg' : ext;

      return {
        success: true,
        date: memorial.date,
        image: `data:image/${mimeType};base64,${base64}`,
        filename: path.basename(memorial.imagePath),
      };
    }

    return {
      success: false,
      message: '今日纪念图片尚未生成',
      date: today,
    };
  }

  async getHistory(limit: number = 10, offset: number = 0): Promise<Memorial[]> {
    return this.memorialRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async regenerate(): Promise<{ success: boolean; message?: string; path?: string }> {
    const result = await this.processMemories();

    if (result) {
      return {
        success: true,
        message: '纪念图片已重新生成',
        path: result,
      };
    }

    return {
      success: false,
      message: '生成失败或没有可用照片',
    };
  }
}
