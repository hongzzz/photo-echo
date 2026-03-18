import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  init,
  getAllAlbums,
  getAlbumInfo,
  downloadAsset,
} from '@immich/sdk';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import libheif from 'libheif-js';

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

  async getHistoricalPhotos(date: Date, daysLookback: number = 365): Promise<Asset[]> {
    const albums = await this.getAlbums();
    const allAssets: Array<{ asset: Asset; date: Date }> = [];

    for (const album of albums) {
      if (album.assetCount === 0) continue;

      this.logger.debug(`读取相册: ${album.name} (${album.assetCount} 张)`);
      const assets = await this.getAlbumAssets(album.id);

      for (const asset of assets) {
        const photoDate = asset.localDateTime || asset.takenAt || asset.exifInfo?.dateTimeOriginal;
        if (photoDate) {
          allAssets.push({
            asset,
            date: new Date(photoDate),
          });
        }
      }
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysLookback);

    const filtered = allAssets.filter(item => item.date >= cutoffDate);
    filtered.sort((a, b) => b.date.getTime() - a.date.getTime());

    return filtered.map(item => item.asset);
  }

  getThumbnailUrl(assetId: string): string {
    const url = this.configService.get<string>('app.immich.url');
    return `${url}/api/assets/${assetId}/thumbnail`;
  }

  async getThumbnail(assetId: string, savePath: string): Promise<string> {
    try {
      const blob = await downloadAsset({ id: assetId });
      const buffer = Buffer.from(await blob.arrayBuffer());

      const jpegPath = savePath.replace(/\.(heic|heif|png|webp|tiff|bmp)$/i, '.jpg');

      // Debug: log first few bytes to identify format
      const magic = buffer.slice(0, 12).toString('hex');
      this.logger.debug(`Buffer: ${buffer.length} bytes, magic: ${magic}`);

      // Try sharp first for common formats
      try {
        await sharp(buffer).jpeg({ quality: 85 }).toFile(jpegPath);
        return jpegPath;
      } catch (sharpErr) {
        this.logger.debug(`Sharp failed: ${sharpErr.message}`);
      }

      // Try libheif-js to decode HEIC
      try {
        const decoder = new libheif.HeifDecoder();
        const images = decoder.decode(buffer);

        if (!images || images.length === 0) {
          this.logger.error(`Not a valid HEIC file, magic: ${magic}`);
          throw new Error(`Not a valid HEIC file, magic: ${magic}`);
        }

        const image = images[0];
        const width = image.get_width();
        const height = image.get_height();

        // Get image data via display() callback
        const imageData = await new Promise<{ data: Buffer; width: number; height: number }>((resolve, reject) => {
          const outData = new Uint8ClampedArray(width * height * 4);
          image.display({ data: outData, width, height }, (displayData: any) => {
            if (!displayData) {
              reject(new Error('HEIF processing error'));
            } else {
              resolve({
                data: Buffer.from(displayData.data),
                width: displayData.width,
                height: displayData.height,
              });
            }
          });
        });

        await sharp(imageData.data, {
          raw: {
            width: imageData.width,
            height: imageData.height,
            channels: 4,
          },
        })
          .jpeg({ quality: 85 })
          .toFile(jpegPath);

        return jpegPath;
      } catch (heifErr) {
        this.logger.error(`HEIC 解码失败: ${heifErr.message}`);
        throw heifErr;
      }
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
