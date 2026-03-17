import {
  init,
  getAllAlbums,
  getAlbumInfo,
  downloadAsset,
  type AlbumResponseDto,
  type AssetResponseDto,
} from '@immich/sdk';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { config } from '../config';

// 类型定义
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
  thumbnailPath?: string;
}

// Immich SDK 客户端类
export class ImmichClient {
  private initialized = false;

  constructor() {
    this.init();
  }

  private init(): void {
    if (this.initialized) return;

    // SDK 路径不带 /api，需要手动添加
    const baseUrl = config.immich.url.endsWith('/')
      ? config.immich.url + 'api'
      : config.immich.url + '/api';

    init({
      baseUrl,
      apiKey: config.immich.apiKey,
    });

    this.initialized = true;
    console.log('Immich SDK 已初始化');
  }

  /**
   * 获取所有相册
   */
  async getAlbums(): Promise<Array<{ id: string; name: string; assetCount: number }>> {
    try {
      const albums = await getAllAlbums({});
      console.log('SDK 返回的相册数据:', JSON.stringify(albums).slice(0, 500));
      return albums.map(album => ({
        id: album.id,
        name: album.albumName,
        assetCount: album.assetCount,
      }));
    } catch (error) {
      console.error('Get albums failed:', error);
      return [];
    }
  }

  /**
   * 获取相册详情（包括照片）
   */
  async getAlbumAssets(albumId: string): Promise<Asset[]> {
    try {
      const album = await getAlbumInfo({ id: albumId });
      return (album.assets || []).map(asset => this.mapAsset(asset));
    } catch (error) {
      console.error('Get album assets failed:', error);
      return [];
    }
  }

  /**
   * 获取历史照片（从相册中筛选）
   */
  async getHistoricalPhotosFromAlbums(date: Date, daysLookback: number = 365): Promise<Asset[]> {
    const albums = await this.getAlbums();
    const allAssets: Array<{ asset: Asset; date: Date }> = [];

    for (const album of albums) {
      if (album.assetCount === 0) continue;

      console.log(`  读取相册: ${album.name} (${album.assetCount} 张)`);
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

    // 筛选日期在范围内的照片
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysLookback);

    const filtered = allAssets.filter(item => item.date >= cutoffDate);
    filtered.sort((a, b) => b.date.getTime() - a.date.getTime());

    return filtered.map(item => item.asset);
  }

  /**
   * 获取最近的的照片
   */
  async getRecentPhotos(limit: number = 50): Promise<Asset[]> {
    const albums = await this.getAlbums();
    const allAssets: Array<{ asset: Asset; date: Date }> = [];

    for (const album of albums) {
      if (album.assetCount === 0) continue;

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

    allAssets.sort((a, b) => b.date.getTime() - a.date.getTime());
    return allAssets.slice(0, limit).map(item => item.asset);
  }

  /**
   * 映射 SDK 类型到内部类型
   */
  private mapAsset(asset: AssetResponseDto): Asset {
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

  /**
   * 获取缩略图路径
   */
  getThumbnailUrl(assetId: string): string {
    return `${config.immich.url}/api/assets/${assetId}/thumbnail`;
  }

  /**
   * 获取原图路径
   */
  getOriginalUrl(assetId: string): string {
    return `${config.immich.url}/api/assets/${assetId}/original`;
  }

  /**
   * 下载缩略图到本地
   */
  async getThumbnail(assetId: string, savePath: string): Promise<string> {
    try {
      // 使用 SDK 的 downloadAsset 方法下载原图
      const blob = await downloadAsset({ id: assetId });
      const buffer = Buffer.from(await blob.arrayBuffer());

      // 检查文件扩展名，如果是 HEIC 则转换为 JPEG
      const ext = path.extname(savePath).toLowerCase();
      if (ext === '.heic' || ext === '.heif') {
        // 将 HEIC 转换为 JPEG
        const jpegPath = savePath.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
        await sharp(buffer).jpeg({ quality: 85 }).toFile(jpegPath);
        return jpegPath;
      }

      fs.writeFileSync(savePath, buffer);
      return savePath;
    } catch (error) {
      console.error(`Download asset ${assetId} failed:`, error);
      throw error;
    }
  }
}

// 导出单例
export const immichClient = new ImmichClient();
