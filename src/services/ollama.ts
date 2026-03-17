import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

// 类型定义
export interface MemoryScore {
  overall: number;          // 综合评分 0-10
  sentiment: number;        // 情感价值 0-10
  composition: number;      // 构图美感 0-10
  historical: number;       // 历史意义 0-10
  nostalgia: number;        // 怀旧感 0-10
  reason: string;           // 评分理由
}

export interface CaptionResult {
  caption: string;          // 生成的文案
  style: string;            // 风格
}

// Ollama 客户端类
export class OllamaClient {
  private host: string;
  private modelPrimary: string;
  private modelScreen: string;

  constructor() {
    this.host = config.ollama.host;
    this.modelPrimary = config.ollama.modelPrimary;
    this.modelScreen = config.ollama.modelScreen;
  }

  /**
   * 发送请求到 Ollama API
   */
  private async request<T>(model: string, payload: {
    prompt?: string;
    messages?: Array<{ role: string; content: string; images?: string[] }>;
    images?: string[];
    stream?: boolean;
  }): Promise<T> {
    const url = new URL('/api/generate', this.host);

    const body = JSON.stringify({
      model,
      ...payload,
      stream: false,
    });

    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: url.hostname,
        port: url.port || 11434,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
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

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * 将图片转换为 base64
   */
  private imageToBase64(imagePath: string): string {
    const imageBuffer = fs.readFileSync(imagePath);
    return imageBuffer.toString('base64');
  }

  /**
   * 图像分析（通用）
   */
  async analyzeImage(imagePath: string, prompt: string): Promise<string> {
    const base64Image = this.imageToBase64(imagePath);

    const response = await this.request<{ response: string }>(this.modelPrimary, {
      prompt,
      images: [base64Image],
    });

    return response.response || '';
  }

  /**
   * 纪念价值评分（使用快速筛选模型）
   */
  async scoreMemoryValue(imagePath: string): Promise<MemoryScore> {
    const prompt = `你是一个专业的照片策展人。请分析这张照片的纪念价值，并给出评分。

请从以下维度评分（0-10分）：
1. 情感价值 - 照片中的人物情感、亲密时刻
2. 构图美感 - 画面构图、光影、色彩
3. 历史意义 - 值得纪念的时刻、重要场景
4. 怀旧感 - 能唤起美好回忆的程度

最后给出综合评分和简短理由。

请以 JSON 格式返回：
{
  "sentiment": <情感价值评分>,
  "composition": <构图美感评分>,
  "historical": <历史意义评分>,
  "nostalgia": <怀旧感评分>,
  "overall": <综合评分>,
  "reason": "<评分理由，30字以内>"
}`;

    try {
      const base64Image = this.imageToBase64(imagePath);

      const response = await this.request<{ response: string }>(this.modelScreen, {
        prompt,
        images: [base64Image],
      });

      // 解析 JSON 响应
      const resultText = response.response || '';
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          sentiment: parsed.sentiment || 0,
          composition: parsed.composition || 0,
          historical: parsed.historical || 0,
          nostalgia: parsed.nostalgia || 0,
          overall: parsed.overall || 0,
          reason: parsed.reason || '',
        };
      }

      // 解析失败，返回默认评分
      return {
        sentiment: 5,
        composition: 5,
        historical: 5,
        nostalgia: 5,
        overall: 5,
        reason: '评分解析失败',
      };
    } catch (error) {
      console.error('Score memory value failed:', error);
      return {
        sentiment: 0,
        composition: 0,
        historical: 0,
        nostalgia: 0,
        overall: 0,
        reason: '评分失败',
      };
    }
  }

  /**
   * 使用精选模型进行深度评分
   */
  async deepScoreMemoryValue(imagePath: string): Promise<MemoryScore> {
    const prompt = `你是一个专业的照片策展人。请深入分析这张照片的纪念价值，并给出专业评分。

请从以下维度评分（0-10分）：
1. 情感价值 - 照片中的人物情感、亲密时刻、家庭温暖
2. 构图美感 - 画面构图、光影、色彩、视觉吸引力
3. 历史意义 - 值得纪念的时刻、重要场景、成长记录
4. 怀旧感 - 能唤起美好回忆的程度、时光印记
5. 故事性 - 照片能否讲述一个动人的故事

最后给出综合评分和专业评语。

请以 JSON 格式返回：
{
  "sentiment": <情感价值评分>,
  "composition": <构图美感评分>,
  "historical": <历史意义评分>,
  "nostalgia": <怀旧感评分>,
  "overall": <综合评分>,
  "reason": "<评语，50字以内>"
}`;

    try {
      const base64Image = this.imageToBase64(imagePath);

      const response = await this.request<{ response: string }>(this.modelPrimary, {
        prompt,
        images: [base64Image],
      });

      // 解析 JSON 响应
      const resultText = response.response || '';
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          sentiment: parsed.sentiment || 0,
          composition: parsed.composition || 0,
          historical: parsed.historical || 0,
          nostalgia: parsed.nostalgia || 0,
          overall: parsed.overall || 0,
          reason: parsed.reason || '',
        };
      }

      return {
        sentiment: 5,
        composition: 5,
        historical: 5,
        nostalgia: 5,
        overall: 5,
        reason: '评分解析失败',
      };
    } catch (error) {
      console.error('Deep score memory value failed:', error);
      return {
        sentiment: 0,
        composition: 0,
        historical: 0,
        nostalgia: 0,
        overall: 0,
        reason: '评分失败',
      };
    }
  }

  /**
   * 生成艺术风格文案
   */
  async generateCaption(imagePath: string, style: 'classical' | 'modern' | 'nostalgic' = 'classical'): Promise<CaptionResult> {
    const stylePrompts = {
      classical: `请为这张照片生成一句古典诗意风格的纪念文案，要求：
- 古风古韵，含蓄典雅
- 2-4句话
- 唤起对时光的感悟
- 用诗意的语言表达情感`,
      modern: `请为这张照片生成一句现代简约风格的纪念文案，要求：
- 简洁有力，直击人心
- 1-3句话
- 符合当代审美
- 温暖人心`,
      nostalgic: `请为这张照片生成一句怀旧复古风格的纪念文案，要求：
- 怀旧温暖，带有时光质感
- 2-4句话
- 唤起美好的回忆
- 带有复古情怀`,
    };

    try {
      const base64Image = this.imageToBase64(imagePath);

      const response = await this.request<{ response: string }>(this.modelPrimary, {
        prompt: stylePrompts[style],
        images: [base64Image],
      });

      const caption = (response.response || '').trim();

      return {
        caption,
        style,
      };
    } catch (error) {
      console.error('Generate caption failed:', error);
      return {
        caption: '时光静好，岁月如歌',
        style,
      };
    }
  }

  /**
   * 快速筛选图片（使用 Moondream）
   * 如果没有配置粗筛模型，则跳过筛选直接返回 true
   */
  async quickScreen(imagePath: string): Promise<boolean> {
    // 如果没有配置粗筛模型，跳过筛选
    if (!this.modelScreen || this.modelScreen.trim() === '') {
      return true;
    }

    const prompt = `请简要回答：这张照片是否有纪念价值？（是否有值得保留的记忆瞬间）

请只回答 "是" 或 "否"，不需要其他解释。`;

    try {
      const base64Image = this.imageToBase64(imagePath);

      const response = await this.request<{ response: string }>(this.modelScreen, {
        prompt,
        images: [base64Image],
      });

      const result = (response.response || '').trim().toLowerCase();
      return result.includes('是') || result.includes('yes') || result.includes('true');
    } catch (error) {
      console.error('Quick screen failed:', error);
      // 出错时默认通过
      return true;
    }
  }
}

// 导出单例
export const ollamaClient = new OllamaClient();
