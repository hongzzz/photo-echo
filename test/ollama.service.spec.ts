import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OllamaService } from '../src/modules/ollama/ollama.service';
import { EventEmitter } from 'events';

// Mock fs
vi.mock('fs', () => ({
  readFileSync: vi.fn(() => Buffer.from('fake-image-data')),
}));

// Track request callback for each test
let mockRequestImpl: (opts: unknown, cb: (res: EventEmitter) => void) => EventEmitter;

vi.mock('http', () => {
  return {
    request: vi.fn((opts: unknown, cb: (res: EventEmitter) => void) => {
      return mockRequestImpl(opts, cb);
    }),
  };
});

vi.mock('https', () => {
  return {
    request: vi.fn((opts: unknown, cb: (res: EventEmitter) => void) => {
      return mockRequestImpl(opts, cb);
    }),
  };
});

function setupSuccessResponse(responseData: object) {
  mockRequestImpl = (_opts, cb) => {
    const req = new EventEmitter() as EventEmitter & { write: () => void; end: () => void; destroy: () => void };
    req.write = vi.fn();
    req.end = vi.fn(() => {
      const res = new EventEmitter();
      cb(res);
      res.emit('data', JSON.stringify(responseData));
      res.emit('end');
    });
    req.destroy = vi.fn();
    return req;
  };
}

function setupErrorResponse(error: Error) {
  mockRequestImpl = (_opts, _cb) => {
    const req = new EventEmitter() as EventEmitter & { write: () => void; end: () => void; destroy: () => void };
    req.write = vi.fn();
    req.end = vi.fn(() => {
      setTimeout(() => req.emit('error', error), 1);
    });
    req.destroy = vi.fn();
    return req;
  };
}

describe('OllamaService', () => {
  let service: OllamaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OllamaService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              const config: Record<string, string> = {
                'app.ollama.host': 'http://localhost:11434',
                'app.ollama.modelPrimary': 'test-primary',
                'app.ollama.modelScreen': 'test-screen',
                'app.ollama.modelText': 'test-text',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<OllamaService>(OllamaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('quickScreen', () => {
    it('should return true when model responds with 是', async () => {
      setupSuccessResponse({ response: '是' });
      const result = await service.quickScreen('/fake/image.jpg');
      expect(result).toBe(true);
    });

    it('should return false when model responds with 否', async () => {
      setupSuccessResponse({ response: '否' });
      const result = await service.quickScreen('/fake/image.jpg');
      expect(result).toBe(false);
    });

    it('should return true on error (graceful degradation)', async () => {
      setupErrorResponse(new Error('connection refused'));
      const result = await service.quickScreen('/fake/image.jpg');
      expect(result).toBe(true);
    });

    it('should accept "yes" as positive response', async () => {
      setupSuccessResponse({ response: 'yes' });
      const result = await service.quickScreen('/fake/image.jpg');
      expect(result).toBe(true);
    });
  });

  describe('deepScoreMemoryValue', () => {
    it('should parse valid JSON score from model response', async () => {
      const mockScore = {
        description: '一张温馨的家庭照',
        sentiment: 8,
        composition: 7,
        historical: 6,
        nostalgia: 9,
        overall: 7.5,
        reason: '充满温暖的家庭时刻',
      };
      setupSuccessResponse({ response: JSON.stringify(mockScore) });

      const result = await service.deepScoreMemoryValue('/fake/image.jpg');
      expect(result.overall).toBe(7.5);
      expect(result.sentiment).toBe(8);
      expect(result.description).toBe('一张温馨的家庭照');
    });

    it('should return default score when JSON parsing fails', async () => {
      setupSuccessResponse({ response: 'invalid response without json' });

      const result = await service.deepScoreMemoryValue('/fake/image.jpg');
      expect(result.overall).toBe(5);
      expect(result.reason).toBe('评分解析失败');
    });

    it('should return default score on error', async () => {
      setupErrorResponse(new Error('timeout'));

      const result = await service.deepScoreMemoryValue('/fake/image.jpg');
      expect(result.overall).toBe(5);
      expect(result.reason).toContain('失败');
    });

    it('should extract JSON even with surrounding text', async () => {
      const wrappedResponse = `好的，让我来分析。
{"description": "测试描述", "sentiment": 7, "composition": 8, "historical": 6, "nostalgia": 7, "overall": 7, "reason": "不错"}
以上是评分。`;
      setupSuccessResponse({ response: wrappedResponse });

      const result = await service.deepScoreMemoryValue('/fake/image.jpg');
      expect(result.overall).toBe(7);
      expect(result.description).toBe('测试描述');
    });
  });

  describe('generateCaption', () => {
    it('should return caption with specified style', async () => {
      setupSuccessResponse({ response: '那天的阳光很温暖' });

      const result = await service.generateCaption('一张海边照片', 'modern');
      expect(result.caption).toBe('那天的阳光很温暖');
      expect(result.style).toBe('modern');
    });

    it('should return fallback caption on error', async () => {
      setupErrorResponse(new Error('timeout'));

      const result = await service.generateCaption('描述', 'classical');
      expect(result.caption).toBeTruthy();
      expect(result.style).toBe('classical');
    });

    it('should trim whitespace from response', async () => {
      setupSuccessResponse({ response: '  带空格的文案  \n' });

      const result = await service.generateCaption('描述', 'nostalgic');
      expect(result.caption).toBe('带空格的文案');
    });

    it('should use classical style guide for unknown styles', async () => {
      setupSuccessResponse({ response: '文案' });

      const result = await service.generateCaption('描述', 'unknown_style');
      expect(result.style).toBe('unknown_style');
      expect(result.caption).toBe('文案');
    });
  });
});
