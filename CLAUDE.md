# PhotoEcho - 私有化媒体纪念系统

## 项目概述

PhotoEcho 是本地化媒体纪念系统，从 Immich 检索"历史上的今天"照片，使用 Ollama 多模态模型进行语义评价和筛选，生成艺术风格化中文纪念文案，并合成带有文字的纪念卡片。所有处理在本地完成，不上传照片到第三方。

## 技术栈

- **框架**: NestJS 11 (Node.js + TypeScript 5.7)
- **数据库**: SQLite + TypeORM（图片以 blob 存储于数据库）
- **照片管理**: Immich (自托管, @immich/sdk)
- **AI 推理**: Ollama (三模型架构: 粗筛/评分/文案, HTTP API)
- **图像处理**: Sharp (SVG 文字叠加，根据图片宽度动态排版)
- **定时任务**: @nestjs/schedule (每天凌晨 4 点执行)
- **静态服务**: @nestjs/serve-static
- **包管理**: pnpm

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
│   │   │   ├── memories.controller.ts # REST API + SSE 进度推送
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
│       ├── index.html                 # 主页前端 (原生 JS)
│       └── history.html               # 历史记录页面
├── data/                              # SQLite 数据库 (自动创建)
├── .temp/                             # 临时缩略图 (处理后清理)
├── package.json
├── tsconfig.json
├── nest-cli.json
└── .env.example
```

## 核心处理流水线

`MemoriesService.processMemories()` 执行 7 步流程：

1. **照片检索**: 从 Immich 获取同月同日历史照片 (跨多年)，提取 GPS 地点、人物名等元数据
2. **缩略图下载**: 使用 Immich preview API，5 路并发下载 (避免 HEIC/视频兼容问题)
3. **AI 粗筛**: 快速判断是否有纪念价值（可配置跳过，候选数 ≤ 阈值时自动跳过）
4. **AI 精选**: 多维度评分 + 特征检测（人物/宠物/旅行加权）+ 直接生成文案，传入拍摄时间、地点、人物等元数据
5. **文案确认**: 使用多模态模型直接生成的文案（降级时用文本模型基于描述生成）
6. **图片合成**: Sharp SVG 叠加文字，根据图片实际宽度动态换行
7. **持久化**: 图片以 blob 存入 SQLite，清理临时文件

处理过程通过 SSE 实时推送进度事件。

## 文案风格

| 风格 | 字体 | 字号 | 颜色 | 特点 |
|------|------|------|------|------|
| classical | Songti SC | 52px | 米色 #F0EBE1 | 古典诗意，带阴影 |
| modern | PingFang SC | 44px | 白色 #FFFFFF | 简洁直白 |
| nostalgic | Kaiti SC | 48px | 暖棕 #E8D5B7 | 温暖怀旧，带阴影 |

## 配置说明

在 `.env` 中配置以下变量：

```bash
# Immich
IMMICH_URL=http://localhost:2283
IMMICH_API_KEY=your_api_key_here

# Ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL_PRIMARY=qwen3-vl:8b    # 必需：多模态主力模型（评分+文案+特征检测）
# OLLAMA_MODEL_SCREEN=qwen3-vl:4b   # 可选：粗筛模型，留空或不配置则跳过粗筛
# OLLAMA_MODEL_TEXT=qwen3:8b         # 可选：文案降级模型，主力模型已直接生成文案

# 系统
STYLE_PREFERENCE=modern    # classical | modern | nostalgic
PORT=3000

# 可选
# YEARS_BACK=5                        # 向前追溯多少年的历史照片
# MAX_ASSETS=50                       # 最多处理多少张照片
# DATABASE_PATH=./data/memorials.db   # SQLite 数据库路径
# CRON_SCHEDULE=0 4 * * *             # 定时任务 cron 表达式
# SKIP_SCREEN=true                    # 跳过粗筛步骤
# SCREEN_THRESHOLD=20                 # 候选照片数 ≤ 此值时自动跳过粗筛（默认20）
```

## 开发命令

```bash
pnpm install        # 安装依赖
pnpm run build      # 编译 (含 postbuild 复制 public/)
pnpm run start      # 运行
pnpm run start:dev  # 开发模式（文件监听）
pnpm run start:prod # 生产模式 (node dist/main)
```

## API 接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/health` | 健康检查 (含今日是否已生成) |
| GET | `/api/memories/today` | 获取今日纪念元数据 (JSON) |
| GET | `/api/memories/today/image` | 获取今日纪念卡片图片 (binary) |
| POST | `/api/memories/regenerate` | 重新生成今日纪念 |
| GET | `/api/memories/progress` | SSE 实时进度推送 |
| GET | `/api/memories/history?limit=10&offset=0` | 历史记录 (分页) |
| GET | `/api/memories/image/:id` | 获取指定纪念卡片图片 (binary) |

## Ollama 模型准备

首次运行前需下载主力模型（必需）：

```bash
ollama pull qwen3-vl:8b      # 主力模型（必需：评分 + 特征检测 + 文案生成）
```

以下模型为可选，按需下载：

```bash
ollama pull qwen3-vl:4b      # 可选：粗筛模型（候选照片多时加速筛选）
ollama pull qwen3:8b          # 可选：文案降级模型（主力模型未返回文案时的 fallback）
```

### 模型架构

| 模型 | 配置项 | 用途 | 必需 |
|------|--------|------|------|
| qwen3-vl:8b | OLLAMA_MODEL_PRIMARY | 主力：四维评分 + 特征检测 + 直接看图生成文案 | 是 |
| qwen3-vl:4b | OLLAMA_MODEL_SCREEN | 粗筛：快速判断照片是否有纪念价值 | 否 |
| qwen3:8b | OLLAMA_MODEL_TEXT | 降级：主力模型未返回文案时的 fallback | 否 |

> 评分维度：情感价值 / 构图美感 / 历史意义 / 怀旧感，综合分为加权平均。
> 特征检测：自动识别人物、宠物、旅行场景，给予评分加权（人物+1.5，宠物+1.0，旅行+1.0）。
> 元数据增强：从 Immich 提取拍摄时间、GPS 地点、人脸识别人物名，传递给模型辅助生成更精准的文案。
> 粗筛策略：候选照片数 ≤ SCREEN_THRESHOLD（默认20）时自动跳过粗筛；也可设置 SKIP_SCREEN=true 强制跳过。

## 数据库

SQLite 单表 `memorial`，TypeORM 自动同步 (synchronize: true)：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| date | VARCHAR (indexed) | 日期 YYYY-MM-DD |
| imageData | BLOB | 纪念卡片图片数据 |
| caption | VARCHAR | 生成的文案 |
| sourceAssetId | VARCHAR | Immich 原始资源 ID |
| sourceFileName | VARCHAR | 原始文件名 |
| score | FLOAT | AI 综合评分 |
| style | VARCHAR | 使用的文案风格 |
| createdAt | DATETIME | 创建时间 |

## 设计原则

- **隐私优先**: 所有处理在本地完成，不上传照片到第三方
- **模块化**: NestJS 模块化架构，依赖注入，核心服务标记 @Global()
- **容错降级**: Ollama 不可用时使用默认评分/文案，单张失败不阻塞流水线；粗筛全部未通过时自动跳过进入评分
- **可配置**: 支持多种文案风格，模型可替换

## 注意事项

- Apple Silicon 统一内存有限，建议使用 4-bit 量化模型
- Ollama 模型首次加载需 5-8 秒，后续推理约 30 秒/张；三个模型交替使用时会有模型切换开销
- 定时任务默认每天凌晨 4 点执行，可通过 `CRON_SCHEDULE` 环境变量调整
- Immich 使用 preview API 获取缩略图，自动处理 HEIC 和视频格式
- Ollama 通信使用原生 HTTP (非 SDK)，`stream: false` 模式
- qwen3 系列模型需要 `/no_think` 指令避免输出思考过程干扰 JSON 提取
- 日期计算使用本地时区，非 UTC
