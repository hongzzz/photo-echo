import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// 加载环境变量
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

// 配置接口
export interface Config {
  immich: {
    url: string;
    apiKey: string;
  };
  ollama: {
    host: string;
    modelPrimary: string;
    modelScreen: string;
  };
  system: {
    outputDir: string;
    stylePreference: 'classical' | 'modern' | 'nostalgic';
    daysLookback: number;
    maxAssets: number;
    port: number; // HTTP 服务端口
  };
}

// 获取配置
export const config: Config = {
  immich: {
    url: process.env.IMMICH_URL || 'http://localhost:2283',
    apiKey: process.env.IMMICH_API_KEY || '',
  },
  ollama: {
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    modelPrimary: process.env.OLLAMA_MODEL_PRIMARY || 'qwen3-vl:7b',
    modelScreen: process.env.OLLAMA_MODEL_SCREEN || 'moondream:1.8b',
  },
  system: {
    outputDir: process.env.OUTPUT_DIR || './output',
    stylePreference: (process.env.STYLE_PREFERENCE as 'classical' | 'modern' | 'nostalgic') || 'classical',
    daysLookback: parseInt(process.env.DAYS_LOOKBACK || '365', 10),
    maxAssets: parseInt(process.env.MAX_ASSETS || '50', 10),
    port: parseInt(process.env.PORT || '3000', 10),
  },
};

// 确保输出目录存在
export function ensureOutputDir(): string {
  const outputDir = path.resolve(process.cwd(), config.system.outputDir);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
}

// 验证配置
export function validateConfig(): void {
  if (!config.immich.apiKey) {
    throw new Error('IMMICH_API_KEY is required');
  }
  if (!config.ollama.modelPrimary) {
    throw new Error('OLLAMA_MODEL_PRIMARY is required');
  }
}
