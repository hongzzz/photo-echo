import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  // Immich 配置
  immich: {
    url: process.env.IMMICH_URL || 'http://localhost:2283',
    apiKey: process.env.IMMICH_API_KEY || '',
  },
  // Ollama 配置
  ollama: {
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    modelPrimary: process.env.OLLAMA_MODEL_PRIMARY || 'qwen3-vl:7b',
    modelScreen: process.env.OLLAMA_MODEL_SCREEN || 'moondream:1.8b',
  },
  // 系统配置
  system: {
    outputDir: process.env.OUTPUT_DIR || './output',
    stylePreference: process.env.STYLE_PREFERENCE || 'classical',
    daysLookback: parseInt(process.env.YEARS_BACK || '5', 10),
    maxAssets: parseInt(process.env.MAX_ASSETS || '50', 10),
    port: parseInt(process.env.PORT || '3000', 10),
    cronSchedule: process.env.CRON_SCHEDULE || '0 4 * * *',
  },
  // 数据库配置
  database: {
    path: process.env.DATABASE_PATH || './data/memorials.db',
  },
}));
