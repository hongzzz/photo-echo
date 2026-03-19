import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';

export interface MemoryScore {
  overall: number;
  sentiment: number;
  composition: number;
  historical: number;
  nostalgia: number;
  reason: string;
  description: string;
}

export interface CaptionResult {
  caption: string;
  style: string;
}

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);
  private host: string;
  private modelPrimary: string;
  private modelScreen: string;
  private modelText: string;

  constructor(private configService: ConfigService) {
    this.host = this.configService.get<string>('app.ollama.host') || 'http://localhost:11434';
    this.modelPrimary = this.configService.get<string>('app.ollama.modelPrimary') || 'qwen3-vl:8b';
    this.modelScreen = this.configService.get<string>('app.ollama.modelScreen') || 'qwen3-vl:4b';
    this.modelText = this.configService.get<string>('app.ollama.modelText') || 'qwen3:8b';
  }

  private async requestOnce<T>(model: string, payload: any, timeoutMs: number): Promise<T> {
    const url = new URL('/api/generate', this.host);

    const body = JSON.stringify({
      model,
      ...payload,
      stream: false,
    });

    const httpModule = url.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const req = httpModule.request({
        hostname: url.hostname,
        port: url.port || 11434,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: timeoutMs,
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(`Ollama Error: ${parsed.error}`));
            } else {
              resolve(parsed);
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Ollama request timed out after ${timeoutMs / 1000}s`));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  private async request<T>(model: string, payload: any, timeoutMs = 300_000, maxRetries = 1): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.requestOnce<T>(model, payload, timeoutMs);
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries) {
          const delay = (attempt + 1) * 2000;
          this.logger.warn(`Ollama 请求失败，${delay / 1000}s 后重试 (${attempt + 1}/${maxRetries}): ${lastError.message}`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastError;
  }

  private imageToBase64(imagePath: string): string {
    const imageBuffer = fs.readFileSync(imagePath);
    return imageBuffer.toString('base64');
  }

  async quickScreen(imagePath: string): Promise<boolean> {
    if (!this.modelScreen || this.modelScreen.trim() === '') {
      return true;
    }

    const prompt = `请简要回答：这张照片是否有纪念价值？（是否有值得保留的记忆瞬间）

请只回答 "是" 或 "否"，不需要其他解释。`;

    try {
      const base64Image = this.imageToBase64(imagePath);
      const fileName = imagePath.split('/').pop();

      this.logger.debug(`[粗筛] 开始筛选: ${fileName}, 模型: ${this.modelScreen}`);
      const startTime = Date.now();

      const response = await this.request<{ response: string }>(this.modelScreen, {
        prompt,
        images: [base64Image],
      }, 120_000);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rawResult = (response.response || '').trim();
      const result = rawResult.toLowerCase();
      const pass = result.includes('是') || result.includes('yes') || result.includes('true');

      this.logger.log(`[粗筛] ${fileName}: ${pass ? '通过' : '淘汰'} (${elapsed}s) 模型回复: "${rawResult.substring(0, 80)}"`);
      return pass;
    } catch (error) {
      this.logger.error(`[粗筛] 筛选失败: ${imagePath.split('/').pop()}, 默认通过`, error);
      return true;
    }
  }

  async deepScoreMemoryValue(imagePath: string): Promise<MemoryScore> {
    const prompt = `/no_think
你是一个专业的照片策展人。请仔细观察这张照片，完成两项任务：

**任务一：画面描述**
用 100-150 字详细描述画面内容，包括：人物、场景、动作、表情、光线、氛围等。

**任务二：纪念价值评分（0-10分）**
1. 情感价值(sentiment) - 人物情感、亲密时刻、家庭温暖
2. 构图美感(composition) - 画面构图、光影、色彩
3. 历史意义(historical) - 值得纪念的时刻、成长记录
4. 怀旧感(nostalgia) - 能唤起美好回忆的程度

综合评分(overall) = 四项维度的加权平均，不要随意拔高。

请严格以 JSON 格式返回，不要输出其他内容：
{
  "description": "<画面描述，100-150字>",
  "sentiment": <分数>,
  "composition": <分数>,
  "historical": <分数>,
  "nostalgia": <分数>,
  "overall": <综合评分>,
  "reason": "<评语，50字以内>"
}`;

    try {
      const base64Image = this.imageToBase64(imagePath);
      const fileName = imagePath.split('/').pop();

      this.logger.log(`[深度评分] 开始评分: ${fileName}, 模型: ${this.modelPrimary}`);
      const startTime = Date.now();

      const response = await this.request<{ response: string }>(this.modelPrimary, {
        prompt,
        images: [base64Image],
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const resultText = response.response || '';

      this.logger.debug(`[深度评分] 模型响应 (${elapsed}s): ${resultText.substring(0, 200)}${resultText.length > 200 ? '...' : ''}`);

      const jsonMatch = resultText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const score: MemoryScore = {
          sentiment: parsed.sentiment || 0,
          composition: parsed.composition || 0,
          historical: parsed.historical || 0,
          nostalgia: parsed.nostalgia || 0,
          overall: parsed.overall || 0,
          reason: parsed.reason || '',
          description: parsed.description || '',
        };

        this.logger.log(
          `[深度评分] ${fileName}: 综合=${score.overall} | 情感=${score.sentiment} 构图=${score.composition} 历史=${score.historical} 怀旧=${score.nostalgia} | ${score.reason}`,
        );
        this.logger.debug(`[深度评分] ${fileName} 画面描述: ${score.description}`);
        return score;
      }

      this.logger.warn(`[深度评分] ${fileName}: JSON 解析失败，使用默认分数。原始响应: ${resultText.substring(0, 100)}`);
      return {
        sentiment: 5,
        composition: 5,
        historical: 5,
        nostalgia: 5,
        overall: 5,
        reason: '评分解析失败',
        description: '',
      };
    } catch (error) {
      this.logger.error(`[深度评分] 评分失败: ${imagePath.split('/').pop()}`, error);
      return {
        sentiment: 5,
        composition: 5,
        historical: 5,
        nostalgia: 5,
        overall: 5,
        reason: '评分失败，使用默认分数',
        description: '',
      };
    }
  }

  async generateCaption(description: string, style: string = 'classical'): Promise<CaptionResult> {
    const styleGuide = {
      classical: '含蓄隽永风格：用凝练、有意境的现代中文表达，不要用古诗词句式或文言文，要像散文随笔一样自然',
      modern: '现代生活风格：像朋友圈文案一样真实自然，口语化但不随意，有温度有画面感，避免矫揉造作和空泛抒情',
      nostalgic: '温暖回忆风格：用平实、温暖的叙述唤起回忆，像在跟老朋友聊起从前，不要华丽辞藻，要有生活气息',
    };

    const guide = styleGuide[style as keyof typeof styleGuide] || styleGuide.classical;

    const prompt = `/no_think
你是一位文案创作者。根据以下照片的画面描述，写一段回忆文案。

**画面描述：**
${description}

**风格要求：** ${guide}

**格式要求：**
- 1-2句话，总共不超过30个字
- 用现代白话文，禁止使用古诗词、文言文句式
- 不要用"岁月""光阴""流转""静好""如歌"等陈词滥调
- 只输出文案本身，不要加引号、标题或解释

请直接输出文案：`;

    try {
      this.logger.log(`[文案生成] 模型: ${this.modelText}, 风格: ${style}`);
      this.logger.debug(`[文案生成] 画面描述: ${description.substring(0, 100)}`);
      const startTime = Date.now();

      const response = await this.request<{ response: string }>(this.modelText, {
        prompt,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const caption = (response.response || '').trim();

      this.logger.log(`[文案生成] 完成 (${elapsed}s): ${caption}`);

      return {
        caption,
        style,
      };
    } catch (error) {
      this.logger.error('[文案生成] 生成失败', error);
      return {
        caption: '翻到这张照片，忽然想起那天的阳光',
        style,
      };
    }
  }
}
