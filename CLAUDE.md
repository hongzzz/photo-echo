# PhotoEcho - 私有化媒体纪念系统

## 项目概述

PhotoEcho 是基于 Apple Silicon M1 Pro 的本地化媒体纪念系统，从 Immich 检索"历史上的今天"照片，使用 Ollama 多模态模型进行语义评价和筛选，生成艺术风格化中文纪念文案，并合成带有文字的图片。

## 技术栈

- **框架**: NestJS 10 (Node.js + TypeScript 5.7)
- **数据库**: SQLite + TypeORM
- **照片管理**: Immich (自托管, @immich/sdk)
- **AI 推理**: Ollama (本地多模态模型, HTTP API)
- **图像处理**: Sharp (SVG 文字叠加)
- **定时任务**: @nestjs/schedule (每天凌晨 4 点执行)
- **静态服务**: @nestjs/serve-static

## 项目结构

```
photo-echo/
├── src/
│   ├── main.ts                        # 应用入口，启动 NestJS
│   ├── app.module.ts                  # 根模块，注册所有子模块
│   ├── app.controller.ts              # 根控制器
│   ├── config/
│   │   └── configuration.ts           # 配置加载 (registerAs 'app')
│   ├── modules/
│   │   ├── memories/                  # 纪念照片模块（核心）
│   │   │   ├── dto/
│   │   │   │   └── memories.dto.ts
│   │   │   ├── entities/
│   │   │   │   └── memorial.entity.ts
│   │   │   ├── memories.module.ts
│   │   │   ├── memories.controller.ts
│   │   │   ├── memories.service.ts    # 7 步处理流水线
│   │   │   └── memories.scheduler.ts  # Cron 定时任务
│   │   ├── immich/                    # Immich 照片服务
│   │   │   ├── immich.service.ts      # SDK 封装，preview API
│   │   │   └── immich.module.ts       # @Global()
│   │   ├── ollama/                    # Ollama AI 推理服务
│   │   │   ├── ollama.service.ts      # HTTP 直连，非 SDK
│   │   │   └── ollama.module.ts       # @Global()
│   │   ├── image-processor/           # 图像合成服务
│   │   │   ├── image-processor.service.ts  # Sharp + SVG 叠加
│   │   │   └── image-processor.module.ts   # @Global()
│   │   └── health/                    # 健康检查
│   │       ├── health.controller.ts
│   │       └── health.module.ts
│   └── public/
│       └── index.html                 # 单页前端 (原生 JS)
├── data/                              # SQLite 数据库 (自动创建)
├── output/                            # 纪念卡片输出目录
├── .temp/                             # 临时缩略图 (处理后清理)
├── package.json
├── tsconfig.json
├── nest-cli.json
└── .env.example
```

## 核心处理流水线

`MemoriesService.processMemories()` 执行 7 步流程：

1. **照片检索**: 从 Immich 获取同月同日历史照片 (跨多年)
2. **缩略图下载**: 使用 Immich preview API (避免 HEIC/视频兼容问题)
3. **AI 粗筛**: Moondream 快速判断是否有纪念价值
4. **AI 精选**: Qwen3-VL 多维度评分 (情感/构图/历史/怀旧/综合, 0-10 分)
5. **文案生成**: 基于最高分图像生成中文纪念文案 (3 种风格)
6. **图片合成**: Sharp SVG 叠加文字，生成纪念卡片
7. **持久化**: 存入 SQLite，清理临时文件

## 文案风格

| 风格 | 字体 | 字号 | 颜色 | 特点 |
|------|------|------|------|------|
| classical | SimSun | 48px | 米色 #F5F5DC | 古典诗意，带阴影 |
| modern | PingFang SC | 36px | 白色 #FFFFFF | 简洁直白 |
| nostalgic | Kaiti SC | 42px | 棕褐 #D2B48C | 温暖怀旧，带阴影 |

## 配置说明

在 `.env` 中配置以下变量：

```bash
# Immich
IMMICH_URL=http://localhost:2283
IMMICH_API_KEY=your_api_key_here

# Ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL_PRIMARY=qwen3-vl:8b
OLLAMA_MODEL_SCREEN=moondream:1.8b

# 系统
OUTPUT_DIR=./output
STYLE_PREFERENCE=classical  # classical | modern | nostalgic
PORT=3000

# 可选
# YEARS_BACK=5                        # 向前追溯多少年的历史照片
# MAX_ASSETS=50                       # 最多处理多少张照片
# DATABASE_PATH=./data/memorials.db   # SQLite 数据库路径
# CRON_SCHEDULE=0 4 * * *             # 定时任务 cron 表达式
```

## 开发命令

```bash
npm install         # 安装依赖
npm run build       # 编译 (含 postbuild 复制 public/)
npm run start       # 运行
npm run start:dev   # 开发模式（文件监听）
npm run start:prod  # 生产模式 (node dist/main)
```

## API 接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/health` | 健康检查 (含今日是否已生成) |
| GET | `/api/memories/today` | 获取今日纪念 (base64 图片) |
| POST | `/api/memories/regenerate` | 重新生成今日纪念 |
| GET | `/api/memories/history?limit=10&offset=0` | 历史记录 (分页) |

## Ollama 模型准备

首次运行前需下载模型：

```bash
ollama pull moondream        # 粗筛模型（快速，1.8b）
ollama pull qwen3-vl:8b      # 主力模型（中文理解强）
```

## 数据库

SQLite 单表 `memorial`，TypeORM 自动同步 (synchronize: true)：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| date | VARCHAR | 日期 YYYY-MM-DD |
| imagePath | VARCHAR | 输出图片路径 |
| caption | VARCHAR | 生成的文案 |
| sourceAssetId | VARCHAR | Immich 原始资源 ID |
| sourceFileName | VARCHAR | 原始文件名 |
| score | FLOAT | AI 综合评分 |
| style | VARCHAR | 使用的文案风格 |
| createdAt | DATETIME | 创建时间 |

## 设计原则

- **隐私优先**: 所有处理在本地完成，不上传照片到第三方
- **模块化**: NestJS 模块化架构，依赖注入，核心服务标记 @Global()
- **容错降级**: Ollama 不可用时使用默认评分/文案，单张失败不阻塞流水线
- **可配置**: 支持多种文案风格和输出格式

## 注意事项

- M1 Pro 统一内存有限，建议使用 4-bit 量化模型
- Ollama 模型首次加载需 5-8 秒，后续推理约 30 秒/张
- 定时任务默认每天凌晨 4 点执行，可通过 `CRON_SCHEDULE` 环境变量调整
- Immich 使用 preview API 获取缩略图，自动处理 HEIC 和视频格式
- Ollama 通信使用原生 HTTP (非 SDK)，`stream: false` 模式
