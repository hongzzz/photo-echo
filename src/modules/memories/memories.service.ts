import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Subject } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

import { Memorial } from './entities/memorial.entity';
import { ImmichService, Asset } from '../immich/immich.service';
import { OllamaService, MemoryScore } from '../ollama/ollama.service';
import { ImageProcessorService } from '../image-processor/image-processor.service';

export interface ProgressEvent {
  step: number;
  totalSteps: number;
  message: string;
  detail?: string;
}

interface ProcessedAsset extends Asset {
  tempPath?: string;
  score?: MemoryScore;
}

@Injectable()
export class MemoriesService {
  private readonly logger = new Logger(MemoriesService.name);
  private tempDir: string;
  private progressSubject = new Subject<ProgressEvent>();
  private _generating = false;
  private _lastProgress: ProgressEvent | null = null;

  get generating() {
    return this._generating;
  }

  get lastProgress() {
    return this._lastProgress;
  }

  get progress$() {
    return this.progressSubject.asObservable();
  }

  private emitProgress(step: number, totalSteps: number, message: string, detail?: string) {
    this._lastProgress = { step, totalSteps, message, detail };
    this.progressSubject.next(this._lastProgress);
  }

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
    this._generating = true;
    this._lastProgress = null;
    this.logger.log('='.repeat(50));
    this.logger.log('开始处理今日回忆...');
    this.logger.log('='.repeat(50));

    const today = new Date();
    const todayDate = today.toISOString().split('T')[0];

    try {
      // 1. 获取"历史上的今天"照片
      this.logger.log('\n[1/7] 检索历史上的今天照片...');
      this.emitProgress(1, 7, '检索历史照片');
      const yearsBack = this.configService.get<number>('app.system.yearsBack') || 5;
      const assets = await this.immichService.getHistoricalPhotos(today, yearsBack);

      if (assets.length === 0) {
        this.logger.log('未找到历史上的今天照片');
        return null;
      }

      this.logger.log(`找到 ${assets.length} 张历史上的今天照片`);

      // 2. 并发下载缩略图
      this.logger.log('\n[2/7] 下载缩略图...');
      this.emitProgress(2, 7, '下载缩略图', `共 ${assets.length} 张`);
      const maxAssets = this.configService.get<number>('app.system.maxAssets') || 50;
      const assetsToProcess = assets.slice(0, maxAssets);

      const DOWNLOAD_CONCURRENCY = 5;
      const downloadedAssets: ProcessedAsset[] = [];
      for (let i = 0; i < assetsToProcess.length; i += DOWNLOAD_CONCURRENCY) {
        const batch = assetsToProcess.slice(i, i + DOWNLOAD_CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(async (asset) => {
            const tempPath = path.join(this.tempDir, `${asset.id}.jpg`);
            await this.immichService.getThumbnail(asset.id, tempPath);
            return { ...asset, tempPath } as ProcessedAsset;
          }),
        );
        for (const result of results) {
          if (result.status === 'fulfilled') {
            downloadedAssets.push(result.value);
          } else {
            this.logger.error(`下载缩略图失败`, result.reason);
          }
        }
      }

      this.logger.log(`下载完成 ${downloadedAssets.length}/${assetsToProcess.length} 张`);

      // 3. AI 粗筛（Ollama 单线程，逐张处理）
      this.logger.log('\n[3/7] AI 粗筛...');
      this.emitProgress(3, 7, 'AI 粗筛', `${downloadedAssets.length} 张待筛选`);
      const processedAssets: ProcessedAsset[] = [];
      for (const asset of downloadedAssets) {
        try {
          const pass = await this.ollamaService.quickScreen(asset.tempPath!);
          if (pass) {
            processedAssets.push(asset);
            this.logger.debug(`  ✓ ${asset.originalFileName} 通过粗筛`);
          } else {
            this.logger.debug(`  ✗ ${asset.originalFileName} 未通过粗筛`);
            fs.unlinkSync(asset.tempPath!);
          }
        } catch (error) {
          this.logger.error(`粗筛 ${asset.id} 失败`, error);
        }
      }

      if (processedAssets.length === 0) {
        this.logger.log('没有通过筛选的照片');
        return null;
      }

      this.logger.log(`通过粗筛 ${processedAssets.length}/${downloadedAssets.length} 张照片`);

      // 4. 深度评分和选择
      this.logger.log('\n[4/7] 深度评分...');
      this.emitProgress(4, 7, '深度评分', `${processedAssets.length} 张待评分`);
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

      // 5. 生成纪念文案
      this.logger.log('\n[5/7] 生成纪念文案...');
      this.emitProgress(5, 7, '生成纪念文案');
      const stylePreference = this.configService.get<string>('app.system.stylePreference') || 'classical';
      const imageDescription = bestAsset.score?.description || '';
      const captionResult = await this.ollamaService.generateCaption(
        imageDescription,
        stylePreference
      );

      this.logger.log(`生成的文案: ${captionResult.caption}`);

      // 6. 合成纪念图片
      this.logger.log('\n[6/7] 合成纪念图片...');
      this.emitProgress(6, 7, '合成纪念图片');
      const outputDir = this.configService.get<string>('app.system.outputDir') || './output';
      const outputPath = path.join(outputDir, `memorial_${todayDate}.jpg`);

      const takenDate = bestAsset.takenAt || bestAsset.localDateTime || bestAsset.createdAt;
      const photoDate = takenDate ? new Date(takenDate) : today;

      const finalPath = await this.imageProcessorService.createMemorialCardWithDate(
        bestAsset.tempPath,
        captionResult.caption,
        photoDate,
        stylePreference,
        outputPath
      );

      this.logger.log(`纪念图片已保存: ${finalPath}`);

      // 7. 清理临时文件
      this.logger.log('\n[7/7] 清理临时文件...');
      this.emitProgress(7, 7, '清理临时文件');
      for (const asset of downloadedAssets) {
        if (asset.tempPath && fs.existsSync(asset.tempPath)) {
          fs.unlinkSync(asset.tempPath);
        }
      }

      // 删除当天旧记录及其图片文件
      const oldMemorials = await this.memorialRepository.find({ where: { date: todayDate } });
      for (const old of oldMemorials) {
        if (old.imagePath && fs.existsSync(old.imagePath)) {
          fs.unlinkSync(old.imagePath);
        }
      }
      if (oldMemorials.length > 0) {
        await this.memorialRepository.remove(oldMemorials);
        this.logger.log(`已清理当天 ${oldMemorials.length} 条旧记录`);
      }

      // 保存到数据库
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
    } finally {
      this._generating = false;
      this._lastProgress = null;
    }
  }

  async getTodayMemorial() {
    const today = new Date().toISOString().split('T')[0];

    const memorial = await this.memorialRepository.findOne({
      where: { date: today },
      order: { createdAt: 'DESC' },
    });

    if (memorial && fs.existsSync(memorial.imagePath)) {
      return {
        success: true,
        generating: this._generating,
        progress: this._lastProgress,
        date: memorial.date,
        caption: memorial.caption,
        score: memorial.score,
        style: memorial.style,
      };
    }

    return {
      success: false,
      generating: this._generating,
      progress: this._lastProgress,
      message: '今日纪念图片尚未生成',
      date: today,
    };
  }

  async getTodayImage(): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const today = new Date().toISOString().split('T')[0];

    const memorial = await this.memorialRepository.findOne({
      where: { date: today },
      order: { createdAt: 'DESC' },
    });

    if (!memorial || !fs.existsSync(memorial.imagePath)) {
      return null;
    }

    const buffer = fs.readFileSync(memorial.imagePath);
    const ext = path.extname(memorial.imagePath).slice(1);
    const mimeType = ext === 'jpg' ? 'jpeg' : ext;
    return { buffer, mimeType: `image/${mimeType}` };
  }

  async getHistory(limit: number = 10, offset: number = 0): Promise<{ items: Memorial[]; total: number }> {
    const [items, total] = await this.memorialRepository.findAndCount({
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total };
  }

  async getMemorialImage(id: number): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const memorial = await this.memorialRepository.findOne({ where: { id } });
    if (!memorial || !fs.existsSync(memorial.imagePath)) {
      return null;
    }
    const buffer = fs.readFileSync(memorial.imagePath);
    const ext = path.extname(memorial.imagePath).slice(1);
    const mimeType = ext === 'jpg' ? 'jpeg' : ext;
    return { buffer, mimeType: `image/${mimeType}` };
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
