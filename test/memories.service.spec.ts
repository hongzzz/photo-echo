import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Memorial } from '../src/modules/memories/entities/memorial.entity';
import { MemoriesService } from '../src/modules/memories/memories.service';
import { ImmichService } from '../src/modules/immich/immich.service';
import { OllamaService } from '../src/modules/ollama/ollama.service';
import { ImageProcessorService } from '../src/modules/image-processor/image-processor.service';

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

describe('MemoriesService', () => {
  let service: MemoriesService;
  let immichService: { getHistoricalPhotos: ReturnType<typeof vi.fn>; getThumbnail: ReturnType<typeof vi.fn> };
  let ollamaService: { quickScreen: ReturnType<typeof vi.fn>; deepScoreMemoryValue: ReturnType<typeof vi.fn>; generateCaption: ReturnType<typeof vi.fn> };
  let imageProcessorService: { createMemorialCardWithDate: ReturnType<typeof vi.fn> };
  let memorialRepository: {
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    findAndCount: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    immichService = {
      getHistoricalPhotos: vi.fn(),
      getThumbnail: vi.fn(),
    };

    ollamaService = {
      quickScreen: vi.fn(),
      deepScoreMemoryValue: vi.fn(),
      generateCaption: vi.fn(),
    };

    imageProcessorService = {
      createMemorialCardWithDate: vi.fn(),
    };

    memorialRepository = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
      findAndCount: vi.fn(),
      create: vi.fn((data: Partial<Memorial>) => data),
      save: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoriesService,
        { provide: getRepositoryToken(Memorial), useValue: memorialRepository },
        { provide: ImmichService, useValue: immichService },
        { provide: OllamaService, useValue: ollamaService },
        { provide: ImageProcessorService, useValue: imageProcessorService },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              const config: Record<string, string | number> = {
                'app.system.yearsBack': 5,
                'app.system.maxAssets': 50,
                'app.system.stylePreference': 'modern',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MemoriesService>(MemoriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processMemories', () => {
    it('should return null when no historical photos found', async () => {
      immichService.getHistoricalPhotos.mockResolvedValue([]);

      const result = await service.processMemories();
      expect(result).toBeNull();
    });

    it('should complete the full 7-step pipeline', async () => {
      // Step 1: Historical photos
      immichService.getHistoricalPhotos.mockResolvedValue([
        { id: 'asset-1', originalFileName: 'photo1.jpg', createdAt: '2023-03-21T10:00:00Z' },
        { id: 'asset-2', originalFileName: 'photo2.jpg', createdAt: '2024-03-21T10:00:00Z' },
      ]);

      // Step 2: Download thumbnails
      immichService.getThumbnail.mockResolvedValue('/tmp/thumb.jpg');

      // Step 3: Quick screen
      ollamaService.quickScreen.mockResolvedValue(true);

      // Step 4: Deep score (caption included from multimodal model)
      ollamaService.deepScoreMemoryValue
        .mockResolvedValueOnce({
          overall: 7, sentiment: 7, composition: 8, historical: 6, nostalgia: 7,
          reason: '不错', description: '一张美丽的照片', caption: '春天的午后',
        })
        .mockResolvedValueOnce({
          overall: 9, sentiment: 9, composition: 8, historical: 8, nostalgia: 9,
          reason: '很好', description: '温馨的家庭时刻', caption: '那一刻的温暖',
        });

      // Step 5: generateCaption is fallback only, should not be called when caption exists
      ollamaService.generateCaption.mockResolvedValue({
        caption: 'fallback文案',
        style: 'modern',
      });

      // Step 6: Create memorial card
      const fakeBuffer = Buffer.from('fake-image');
      imageProcessorService.createMemorialCardWithDate.mockResolvedValue(fakeBuffer);

      const result = await service.processMemories();

      expect(result).toBeTruthy(); // returns date string
      expect(immichService.getHistoricalPhotos).toHaveBeenCalled();
      expect(immichService.getThumbnail).toHaveBeenCalledTimes(2);
      // quickScreen skipped: 2 photos ≤ screenThreshold (20)
      expect(ollamaService.quickScreen).not.toHaveBeenCalled();
      expect(ollamaService.deepScoreMemoryValue).toHaveBeenCalledTimes(2);
      // generateCaption not called when multimodal model returns caption directly
      expect(ollamaService.generateCaption).not.toHaveBeenCalled();
      expect(imageProcessorService.createMemorialCardWithDate).toHaveBeenCalled();
      expect(memorialRepository.save).toHaveBeenCalled();
    });

    it('should fallback to all photos when none pass screening', async () => {
      immichService.getHistoricalPhotos.mockResolvedValue([
        { id: 'asset-1', originalFileName: 'photo1.jpg', createdAt: '2023-03-21T10:00:00Z' },
      ]);
      immichService.getThumbnail.mockResolvedValue('/tmp/thumb.jpg');
      ollamaService.quickScreen.mockResolvedValue(false); // fails screening
      ollamaService.deepScoreMemoryValue.mockResolvedValue({
        overall: 6, sentiment: 6, composition: 6, historical: 6, nostalgia: 6,
        reason: '一般', description: '照片描述', caption: '文案',
      });
      ollamaService.generateCaption.mockResolvedValue({ caption: '文案', style: 'modern' });
      imageProcessorService.createMemorialCardWithDate.mockResolvedValue(Buffer.from('img'));

      const result = await service.processMemories();
      expect(result).toBeTruthy();
      // quickScreen skipped (1 photo ≤ threshold), deepScore still called
      expect(ollamaService.quickScreen).not.toHaveBeenCalled();
      expect(ollamaService.deepScoreMemoryValue).toHaveBeenCalled();
    });

    it('should select the highest scored photo', async () => {
      immichService.getHistoricalPhotos.mockResolvedValue([
        { id: 'low', originalFileName: 'low.jpg', createdAt: '2023-03-21' },
        { id: 'high', originalFileName: 'high.jpg', createdAt: '2024-03-21' },
      ]);
      immichService.getThumbnail.mockResolvedValue('/tmp/thumb.jpg');
      ollamaService.quickScreen.mockResolvedValue(true);
      ollamaService.deepScoreMemoryValue
        .mockResolvedValueOnce({ overall: 3, sentiment: 3, composition: 3, historical: 3, nostalgia: 3, reason: '', description: 'low', caption: 'low文案' })
        .mockResolvedValueOnce({ overall: 9, sentiment: 9, composition: 9, historical: 9, nostalgia: 9, reason: '', description: 'high desc', caption: 'high文案' });
      ollamaService.generateCaption.mockResolvedValue({ caption: '文案', style: 'modern' });
      imageProcessorService.createMemorialCardWithDate.mockResolvedValue(Buffer.from('img'));

      await service.processMemories();

      // Caption comes directly from multimodal model, generateCaption not called
      expect(ollamaService.generateCaption).not.toHaveBeenCalled();
      // Saved score should be the highest
      expect(memorialRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ score: 9, sourceAssetId: 'high' }),
      );
    });

    it('should set generating flag during processing', async () => {
      immichService.getHistoricalPhotos.mockResolvedValue([]);

      expect(service.generating).toBe(false);

      const promise = service.processMemories();
      expect(service.generating).toBe(true);

      await promise;
      expect(service.generating).toBe(false);
    });

    it('should delete old records for today before saving', async () => {
      const oldRecord = { id: 1, date: '2026-03-21' };
      memorialRepository.find.mockResolvedValue([oldRecord]);

      immichService.getHistoricalPhotos.mockResolvedValue([
        { id: 'asset-1', originalFileName: 'photo.jpg', createdAt: '2023-03-21' },
      ]);
      immichService.getThumbnail.mockResolvedValue('/tmp/thumb.jpg');
      ollamaService.quickScreen.mockResolvedValue(true);
      ollamaService.deepScoreMemoryValue.mockResolvedValue({
        overall: 7, sentiment: 7, composition: 7, historical: 7, nostalgia: 7, reason: '', description: 'd',
      });
      ollamaService.generateCaption.mockResolvedValue({ caption: '文案', style: 'modern' });
      imageProcessorService.createMemorialCardWithDate.mockResolvedValue(Buffer.from('img'));

      await service.processMemories();

      expect(memorialRepository.remove).toHaveBeenCalledWith([oldRecord]);
    });
  });

  describe('getTodayMemorial', () => {
    it('should return success with memorial data when exists', async () => {
      memorialRepository.findOne.mockResolvedValue({
        id: 1,
        date: '2026-03-21',
        caption: '测试文案',
        score: 8.5,
        style: 'modern',
        createdAt: new Date(),
      });

      const result = await service.getTodayMemorial();
      expect(result.success).toBe(true);
      expect(result.caption).toBe('测试文案');
      expect(result.score).toBe(8.5);
    });

    it('should return failure when no memorial exists', async () => {
      memorialRepository.findOne.mockResolvedValue(null);

      const result = await service.getTodayMemorial();
      expect(result.success).toBe(false);
      expect(result.message).toBeTruthy();
    });

    it('should include generating status', async () => {
      memorialRepository.findOne.mockResolvedValue(null);

      const result = await service.getTodayMemorial();
      expect(result).toHaveProperty('generating');
      expect(result.generating).toBe(false);
    });
  });

  describe('getTodayImage', () => {
    it('should return buffer and mimeType when image exists', async () => {
      const imageBuffer = Buffer.from('jpeg-data');
      memorialRepository.findOne.mockResolvedValue({
        imageData: imageBuffer,
      });

      const result = await service.getTodayImage();
      expect(result).not.toBeNull();
      expect(result!.buffer).toBe(imageBuffer);
      expect(result!.mimeType).toBe('image/jpeg');
    });

    it('should return null when no image exists', async () => {
      memorialRepository.findOne.mockResolvedValue(null);

      const result = await service.getTodayImage();
      expect(result).toBeNull();
    });
  });

  describe('getHistory', () => {
    it('should return items and total count', async () => {
      const items = [
        { id: 1, date: '2026-03-21', caption: '文案1' },
        { id: 2, date: '2026-03-20', caption: '文案2' },
      ];
      memorialRepository.findAndCount.mockResolvedValue([items, 2]);

      const result = await service.getHistory(10, 0);
      expect(result.items).toEqual(items);
      expect(result.total).toBe(2);
    });

    it('should pass pagination parameters', async () => {
      memorialRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.getHistory(5, 10);
      expect(memorialRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5, skip: 10 }),
      );
    });
  });

  describe('getMemorialImage', () => {
    it('should return image by id', async () => {
      const imageBuffer = Buffer.from('image-data');
      memorialRepository.findOne.mockResolvedValue({ imageData: imageBuffer });

      const result = await service.getMemorialImage(42);
      expect(result).not.toBeNull();
      expect(result!.buffer).toBe(imageBuffer);
    });

    it('should return null for non-existent id', async () => {
      memorialRepository.findOne.mockResolvedValue(null);

      const result = await service.getMemorialImage(999);
      expect(result).toBeNull();
    });
  });

  describe('regenerate', () => {
    it('should return success when processMemories succeeds', async () => {
      immichService.getHistoricalPhotos.mockResolvedValue([
        { id: 'a1', originalFileName: 'p.jpg', createdAt: '2023-03-21' },
      ]);
      immichService.getThumbnail.mockResolvedValue('/tmp/t.jpg');
      ollamaService.quickScreen.mockResolvedValue(true);
      ollamaService.deepScoreMemoryValue.mockResolvedValue({
        overall: 7, sentiment: 7, composition: 7, historical: 7, nostalgia: 7, reason: '', description: 'd',
      });
      ollamaService.generateCaption.mockResolvedValue({ caption: '文案', style: 'modern' });
      imageProcessorService.createMemorialCardWithDate.mockResolvedValue(Buffer.from('img'));

      const result = await service.regenerate();
      expect(result.success).toBe(true);
    });

    it('should return failure when no photos available', async () => {
      immichService.getHistoricalPhotos.mockResolvedValue([]);

      const result = await service.regenerate();
      expect(result.success).toBe(false);
    });
  });

  describe('progress$', () => {
    it('should emit progress events during processing', async () => {
      immichService.getHistoricalPhotos.mockResolvedValue([]);

      const events: unknown[] = [];
      const sub = service.progress$.subscribe(e => events.push(e));

      await service.processMemories();
      sub.unsubscribe();

      // Should emit at least step 1 and the final done event
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events[events.length - 1]).toEqual(
        expect.objectContaining({ done: true }),
      );
    });
  });
});
