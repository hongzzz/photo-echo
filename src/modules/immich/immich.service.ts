import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  init,
  getAllAlbums,
  getAlbumInfo,
  searchAssets,
  viewAsset,
  AssetMediaSize,
} from '@immich/sdk';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

export interface Asset {
  id: string;
  originalFileName: string;
  createdAt: string;
  takenAt?: string;
  localDateTime?: string;
  exifInfo?: {
    dateTimeOriginal?: string;
    exposureTime?: string;
    fNumber?: number;
    iso?: number;
    make?: string;
    model?: string;
  };
}

@Injectable()
export class ImmichService implements OnModuleInit {
  private readonly logger = new Logger(ImmichService.name);
  private initialized = false;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.init();
  }

  private init(): void {
    if (this.initialized) return;

    const baseUrl = this.configService.get<string>('app.immich.url');
    const apiKey = this.configService.get<string>('app.immich.apiKey');

    if (!baseUrl || !apiKey) {
      this.logger.warn('Immich 配置不完整，跳过初始化');
      return;
    }

    const url = baseUrl.endsWith('/') ? baseUrl + 'api' : baseUrl + '/api';

    init({
      baseUrl: url,
      apiKey,
    });

    this.initialized = true;
    this.logger.log('Immich SDK 已初始化');
  }

  async getAlbums(): Promise<Array<{ id: string; name: string; assetCount: number }>> {
    try {
      const albums = await getAllAlbums({});
      return albums.map(album => ({
        id: album.id,
        name: album.albumName,
        assetCount: album.assetCount,
      }));
    } catch (error) {
      this.logger.error('获取相册失败', error);
      return [];
    }
  }

  async getAlbumAssets(albumId: string): Promise<Asset[]> {
    try {
      const album = await getAlbumInfo({ id: albumId });
      return (album.assets || []).map(asset => this.mapAsset(asset));
    } catch (error) {
      this.logger.error('获取相册资产失败', error);
      return [];
    }
  }

  async getHistoricalPhotos(date: Date, yearsBack: number = 5): Promise<Asset[]> {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const currentYear = date.getFullYear();
    const allAssets: Asset[] = [];

    // Search each previous year for photos on the same month/day
    for (let y = currentYear - 1; y >= currentYear - yearsBack; y--) {
      const dayStart = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00.000Z`;
      const dayEnd = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T23:59:59.999Z`;

      try {
        this.logger.debug(`搜索 ${y}年${month}月${day}日 的照片...`);
        const result = await searchAssets({
          metadataSearchDto: {
            takenAfter: dayStart,
            takenBefore: dayEnd,
            size: 200,
          },
        });

        const assets = (result.assets?.items || []).map((a: any) => this.mapAsset(a));
        if (assets.length > 0) {
          this.logger.log(`  ${y}年${month}月${day}日: 找到 ${assets.length} 张`);
          allAssets.push(...assets);
        }
      } catch (error) {
        this.logger.error(`搜索 ${y} 年照片失败`, error);
      }
    }

    return allAssets;
  }

  getThumbnailUrl(assetId: string): string {
    const url = this.configService.get<string>('app.immich.url');
    return `${url}/api/assets/${assetId}/thumbnail`;
  }

  async getThumbnail(assetId: string, savePath: string): Promise<string> {
    try {
      // Use Immich's pre-rendered preview (JPEG) instead of downloading the original
      // This avoids HEIC decoding issues and handles videos (returns a frame)
      const blob = await viewAsset({ id: assetId, size: AssetMediaSize.Preview });
      const buffer = Buffer.from(await blob.arrayBuffer());

      const jpegPath = savePath.replace(/\.[^.]+$/, '.jpg');

      await sharp(buffer).jpeg({ quality: 85 }).toFile(jpegPath);
      return jpegPath;
    } catch (error) {
      this.logger.error(`下载资产 ${assetId} 失败`, error);
      throw error;
    }
  }

  private mapAsset(asset: any): Asset {
    return {
      id: asset.id,
      originalFileName: asset.originalFileName || 'unknown',
      createdAt: asset.createdAt,
      takenAt: asset.fileCreatedAt,
      localDateTime: asset.fileCreatedAt,
      exifInfo: asset.exifInfo ? {
        dateTimeOriginal: asset.exifInfo.dateTimeOriginal || undefined,
        exposureTime: asset.exifInfo.exposureTime || undefined,
        fNumber: asset.exifInfo.fNumber || undefined,
        iso: asset.exifInfo.iso || undefined,
        make: asset.exifInfo.make || undefined,
        model: asset.exifInfo.model || undefined,
      } : undefined,
    };
  }
}
