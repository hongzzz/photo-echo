import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ImmichService } from '../src/modules/immich/immich.service';

// Mock the @immich/sdk module
vi.mock('@immich/sdk', () => ({
  init: vi.fn(),
  getAllAlbums: vi.fn(),
  getAlbumInfo: vi.fn(),
  searchAssets: vi.fn(),
  viewAsset: vi.fn(),
  AssetMediaSize: { Preview: 'preview' },
}));

// Mock sharp
vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    jpeg: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(() => Buffer.from('fake')),
  unlinkSync: vi.fn(),
}));

import { searchAssets, getAllAlbums, getAlbumInfo, viewAsset } from '@immich/sdk';

describe('ImmichService', () => {
  let service: ImmichService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImmichService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              const config: Record<string, string> = {
                'app.immich.url': 'http://localhost:2283',
                'app.immich.apiKey': 'test-api-key',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ImmichService>(ImmichService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getHistoricalPhotos', () => {
    it('should search photos for each year', async () => {
      const mockAsset = {
        id: 'asset-1',
        originalFileName: 'photo.jpg',
        createdAt: '2023-03-21T10:00:00Z',
        fileCreatedAt: '2023-03-21T10:00:00Z',
        exifInfo: null,
      };

      vi.mocked(searchAssets).mockResolvedValue({
        assets: { items: [mockAsset] },
      } as never);

      const date = new Date('2026-03-21');
      const result = await service.getHistoricalPhotos(date, 3);

      // Should search 3 years: 2025, 2024, 2023
      expect(searchAssets).toHaveBeenCalledTimes(3);
      expect(result.length).toBe(3); // one asset per year
      expect(result[0].id).toBe('asset-1');
      expect(result[0].originalFileName).toBe('photo.jpg');
    });

    it('should return empty array when no photos found', async () => {
      vi.mocked(searchAssets).mockResolvedValue({
        assets: { items: [] },
      } as never);

      const date = new Date('2026-03-21');
      const result = await service.getHistoricalPhotos(date, 2);

      expect(result).toEqual([]);
    });

    it('should handle search failures gracefully', async () => {
      vi.mocked(searchAssets)
        .mockResolvedValueOnce({ assets: { items: [{ id: 'ok', originalFileName: 'ok.jpg', createdAt: '2025-03-21', fileCreatedAt: '2025-03-21', exifInfo: null }] } } as never)
        .mockRejectedValueOnce(new Error('network error'));

      const date = new Date('2026-03-21');
      const result = await service.getHistoricalPhotos(date, 2);

      // Should still return the successful result
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('ok');
    });

    it('should use correct date range for search', async () => {
      vi.mocked(searchAssets).mockResolvedValue({
        assets: { items: [] },
      } as never);

      const date = new Date('2026-07-04');
      await service.getHistoricalPhotos(date, 1);

      expect(searchAssets).toHaveBeenCalledWith({
        metadataSearchDto: {
          takenAfter: '2025-07-04T00:00:00.000Z',
          takenBefore: '2025-07-04T23:59:59.999Z',
          size: 200,
        },
      });
    });
  });

  describe('getAlbums', () => {
    it('should return mapped albums', async () => {
      vi.mocked(getAllAlbums).mockResolvedValue([
        { id: 'album-1', albumName: 'Vacation', assetCount: 10 },
      ] as never);

      const result = await service.getAlbums();
      expect(result).toEqual([{ id: 'album-1', name: 'Vacation', assetCount: 10 }]);
    });

    it('should return empty array on error', async () => {
      vi.mocked(getAllAlbums).mockRejectedValue(new Error('fail'));

      const result = await service.getAlbums();
      expect(result).toEqual([]);
    });
  });

  describe('getAlbumAssets', () => {
    it('should return mapped assets from album', async () => {
      vi.mocked(getAlbumInfo).mockResolvedValue({
        assets: [
          { id: 'a1', originalFileName: 'pic.jpg', createdAt: '2024-01-01', fileCreatedAt: '2024-01-01', exifInfo: null },
        ],
      } as never);

      const result = await service.getAlbumAssets('album-1');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('a1');
    });

    it('should return empty array on error', async () => {
      vi.mocked(getAlbumInfo).mockRejectedValue(new Error('not found'));

      const result = await service.getAlbumAssets('bad-id');
      expect(result).toEqual([]);
    });
  });

  describe('getThumbnailUrl', () => {
    it('should return correct URL', () => {
      const url = service.getThumbnailUrl('asset-123');
      expect(url).toBe('http://localhost:2283/api/assets/asset-123/thumbnail');
    });
  });

  describe('getThumbnail', () => {
    it('should download and convert to JPEG', async () => {
      const mockBlob = {
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
      };
      vi.mocked(viewAsset).mockResolvedValue(mockBlob as never);

      const result = await service.getThumbnail('asset-1', '/tmp/test.heic');
      expect(result).toBe('/tmp/test.jpg');
      expect(viewAsset).toHaveBeenCalledWith({ id: 'asset-1', size: 'preview' });
    });

    it('should throw on download failure', async () => {
      vi.mocked(viewAsset).mockRejectedValue(new Error('download failed'));

      await expect(service.getThumbnail('bad-id', '/tmp/test.jpg')).rejects.toThrow('download failed');
    });
  });
});
