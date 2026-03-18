# AI Photo Selector - 私有化媒体纪念系统

## 项目概述

基于 Apple Silicon M1 Pro 的本地化媒体纪念系统，从 Immich 检索"历史上的今天"照片，使用 Ollama 多模态模型进行语义评价和筛选，生成艺术风格化中文纪念文案，并合成带有文字的图片。

## 技术栈

- **框架**: NestJS (Node.js + TypeScript)
- **数据库**: SQLite + TypeORM
- **照片管理**: Immich (自托管)
- **AI 推理**: Ollama (本地多模态模型)
- **图像处理**: Sharp
- **定时任务**: @nestjs/schedule (每天 4 点执行)

## 项目结构

```
ai-photo-selector/
├── src/
│   ├── main.ts                      # 应用入口
│   ├── app.module.ts                # 根模块
│   ├── config/
│   │   └── configuration.ts         # 配置加载
│   ├── modules/
│   │   ├── memories/                # 纪念照片模块（核心）
│   │   │   ├── dto/
│   │   │   ├── entities/
│   │   │   │   └── memorial.entity.ts
│   │   │   ├── memories.controller.ts
│   │   │   ├── memories.service.ts
│   │   │   └── memories.scheduler.ts  # 定时任务
│   │   ├── immich/                  # Immich 服务
│   │   │   ├── immich.service.ts
│   │   │   └── immich.module.ts
│   │   ├── ollama/                  # Ollama 服务
│   │   │   ├── ollama.service.ts
│   │   │   └── ollama.module.ts
│   │   ├── image-processor/         # 图像处理
│   │   │   ├── image-processor.service.ts
│   │   │   └── image-processor.module.ts
│   │   └── health/                  # 健康检查
│   │       ├── health.controller.ts
│   │       └── health.module.ts
│   └── public/                      # 前端静态资源
│       └── index.html
├── data/                            # SQLite 数据库
├── output/                          # 纪念卡片输出
├── package.json
├── tsconfig.json
├── nest-cli.json
└── .env.example
```

## 核心功能

1. **照片检索**: 从 Immich 获取特定日期的历史照片
2. **AI 筛选**: Moondream 粗筛 → Qwen3-VL 精选
3. **文案生成**: 基于图像内容生成艺术风格中文文案
4. **图片合成**: Sharp 处理，文字叠加生成纪念卡片
5. **定时任务**: 每天凌晨 4 点自动执行

## 配置说明

在 `.env` 中配置以下变量：

```bash
# Immich
IMMICH_URL=http://localhost:2283
IMMICH_API_KEY=你的APIKey

# Ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL_PRIMARY=qwen3-vl:7b
OLLAMA_MODEL_SCREEN=moondream:1.8b

# 系统
OUTPUT_DIR=./output
STYLE_PREFERENCE=classical  # classical | modern | nostalgic
PORT=3000

# 可选
# DAYS_LOOKBACK=365
# MAX_ASSETS=50
# DATABASE_PATH=./data/memorials.db
```

## 开发命令

```bash
# 安装依赖
npm install

# 编译
npm run build

# 运行
npm run start

# 开发模式（监听）
npm run start:dev
```

## API 接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/api/memories/today` | 获取今日纪念 |
| POST | `/api/memories/regenerate` | 重新生成 |
| GET | `/api/memories/history` | 历史记录 |

## Ollama 模型准备

首次运行前需下载模型：

```bash
# 粗筛模型（快速）
ollama pull moondream

# 主力模型（中文理解强）
ollama pull qwen3-vl:7b
```

## 设计原则

- **隐私优先**: 所有处理在本地完成，不上传照片到第三方
- **模块化**: NestJS 模块化架构，依赖注入
- **可配置**: 支持多种文案风格和输出格式

## 注意事项

- M1 Pro 统一内存有限，建议使用 4-bit 量化模型
- Ollama 模型首次加载需 5-8 秒，后续推理约 30 秒/张
- 定时任务每天 4 点执行，可通过修改 `memories.scheduler.ts` 调整
