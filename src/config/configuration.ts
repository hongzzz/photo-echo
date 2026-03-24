import { registerAs } from '@nestjs/config';
import * as path from 'path';

export default registerAs('app', () => ({
  // Immich 配置
  immich: {
    url: process.env.IMMICH_URL || 'http://localhost:2283',
    apiKey: process.env.IMMICH_API_KEY || '',
  },
  // Ollama 配置
  ollama: {
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    modelPrimary: process.env.OLLAMA_MODEL_PRIMARY || 'qwen3-vl:8b',
    modelScreen: process.env.OLLAMA_MODEL_SCREEN || 'qwen3-vl:4b',
    modelText: process.env.OLLAMA_MODEL_TEXT || 'qwen3:8b',
  },
  // 系统配置
  system: {
    stylePreference: process.env.STYLE_PREFERENCE || 'modern',
    yearsBack: parseInt(process.env.YEARS_BACK || '5', 10),
    maxAssets: parseInt(process.env.MAX_ASSETS || '50', 10),
    port: parseInt(process.env.PORT || '3000', 10),
    cronSchedule: process.env.CRON_SCHEDULE || '0 4 * * *',
    skipScreen: process.env.SKIP_SCREEN === 'true',
    screenThreshold: parseInt(process.env.SCREEN_THRESHOLD || '20', 10),
  },
  // 数据库配置
  database: {
    path: path.resolve(process.env.DATABASE_PATH || './data/memorials.db'),
  },
}));
