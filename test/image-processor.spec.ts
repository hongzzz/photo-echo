import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { ImageProcessorService } from '../src/modules/image-processor/image-processor.service';

const TEST_OUTPUT = path.join(process.cwd(), 'test-output');
const TEST_FIXTURES = path.join(process.cwd(), 'test', 'fixtures');

describe('ImageProcessorService', () => {
  let module: TestingModule;
  let service: ImageProcessorService;
  let testImagePath: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [
            () => ({
              app: {
                system: {
                  outputDir: TEST_OUTPUT,
                },
              },
            }),
          ],
        }),
      ],
      providers: [ImageProcessorService],
    }).compile();

    service = module.get<ImageProcessorService>(ImageProcessorService);

    // Create output and fixtures dirs
    if (!fs.existsSync(TEST_OUTPUT)) {
      fs.mkdirSync(TEST_OUTPUT, { recursive: true });
    }
    if (!fs.existsSync(TEST_FIXTURES)) {
      fs.mkdirSync(TEST_FIXTURES, { recursive: true });
    }

    // Try to use an existing image, otherwise generate one
    const existingTemp = (() => {
      const tempDir = path.join(process.cwd(), '.temp');
      if (!fs.existsSync(tempDir)) return null;
      const jpgs = fs.readdirSync(tempDir).filter(f => f.endsWith('.jpg'));
      return jpgs.length > 0 ? path.join(tempDir, jpgs[0]) : null;
    })();

    if (existingTemp && fs.existsSync(existingTemp)) {
      testImagePath = existingTemp;
    } else {
      testImagePath = path.join(TEST_FIXTURES, 'test-photo.jpg');
      await sharp({
        create: {
          width: 1200,
          height: 800,
          channels: 3,
          background: { r: 120, g: 90, b: 70 },
        },
      })
        .jpeg({ quality: 90 })
        .toFile(testImagePath);
    }
  });

  afterAll(async () => {
    await module.close();
    console.log(`\n  生成的图片保存在: ${TEST_OUTPUT}/`);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate classical style card', async () => {
    const result = await service.createMemorialCard(
      testImagePath,
      '岁月如歌，那些被时间温柔拥抱的瞬间，终会在记忆的长河中熠熠生辉',
      'classical',
    );

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.format).toBe('jpeg');

    fs.writeFileSync(path.join(TEST_OUTPUT, 'test-classical.jpg'), result);
    console.log(`  classical: ${meta.width}x${meta.height}`);
  });

  it('should generate modern style card', async () => {
    const result = await service.createMemorialCard(
      testImagePath,
      '生活不在别处，就在每一个被认真对待的日常里',
      'modern',
    );

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('jpeg');

    fs.writeFileSync(path.join(TEST_OUTPUT, 'test-modern.jpg'), result);
    console.log(`  modern: ${meta.width}x${meta.height}`);
  });

  it('should generate nostalgic style card', async () => {
    const result = await service.createMemorialCard(
      testImagePath,
      '那年夏天的风，吹过旧时光的窗棂，带来一缕温暖的记忆',
      'nostalgic',
    );

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('jpeg');

    fs.writeFileSync(path.join(TEST_OUTPUT, 'test-nostalgic.jpg'), result);
    console.log(`  nostalgic: ${meta.width}x${meta.height}`);
  });

  it('should generate card with date overlay', async () => {
    const testDate = new Date('2023-06-15');
    const result = await service.createMemorialCardWithDate(
      testImagePath,
      '阳光洒满窗台，猫咪慵懒地蜷缩在角落',
      testDate,
      'classical',
    );

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('jpeg');

    fs.writeFileSync(path.join(TEST_OUTPUT, 'test-with-date.jpg'), result);
    console.log(`  with-date: ${meta.width}x${meta.height}`);
  });

  it('should handle long caption with wrapping', async () => {
    const longCaption = '人生若只如初见，何事秋风悲画扇。等闲变却故人心，却道故人心易变。骊山语罢清宵半，泪雨霖铃终不怨。';
    const result = await service.createMemorialCard(
      testImagePath,
      longCaption,
      'classical',
    );

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    fs.writeFileSync(path.join(TEST_OUTPUT, 'test-long-caption.jpg'), result);
    console.log(`  long-caption: ${result.length} bytes`);
  });

  it('should handle multiline caption', async () => {
    const caption = '第一行文案\n第二行文案\n第三行文案';
    const result = await service.createMemorialCard(
      testImagePath,
      caption,
      'modern',
    );

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    fs.writeFileSync(path.join(TEST_OUTPUT, 'test-multiline.jpg'), result);
    console.log(`  multiline: ${result.length} bytes`);
  });

  it('should fallback to classical for unknown style', async () => {
    const result = await service.createMemorialCard(
      testImagePath,
      '未知风格回退测试',
      'nonexistent',
    );

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    fs.writeFileSync(path.join(TEST_OUTPUT, 'test-unknown-style.jpg'), result);
    console.log(`  unknown-style fallback: ${result.length} bytes`);
  });

  it('should compare all 3 styles side by side', async () => {
    const caption = '时光荏苒，唯有记忆中的温暖，永远不会褪色';
    const styles = ['classical', 'modern', 'nostalgic'] as const;

    for (const style of styles) {
      const result = await service.createMemorialCardWithDate(
        testImagePath,
        caption,
        new Date('2024-12-25'),
        style,
      );

      expect(Buffer.isBuffer(result)).toBe(true);
      fs.writeFileSync(path.join(TEST_OUTPUT, `compare-${style}.jpg`), result);
      const meta = await sharp(result).metadata();
      console.log(`  ${style}: ${meta.width}x${meta.height}`);
    }

    console.log(`\n  All comparison images saved to: ${TEST_OUTPUT}/compare-*.jpg`);
  });
});
