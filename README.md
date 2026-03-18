# PhotoEcho

历史照片的回响 — 每天自动从 [Immich](https://immich.app/) 检索"历史上的今天"照片，通过本地 AI 筛选最有纪念价值的一张，生成风格化中文文案并合成纪念卡片。

所有处理在本地完成，照片不会上传到任何第三方服务。

## 功能

- 从 Immich 检索同月同日的历史照片（跨多年）
- 三模型 AI 流水线：qwen3-vl:4b 粗筛 → qwen3-vl:8b 评分描述 → qwen3:8b 文案生成
- "视觉→文本→文案"两阶段架构：多模态模型看图提取描述，纯文本模型生成文案
- 基于画面描述生成艺术风格中文纪念文案（古典 / 现代 / 怀旧）
- Sharp + SVG 合成带文字叠加的纪念卡片
- 每天凌晨 4 点自动执行，也可通过 Web 界面手动触发
- 单页 Web 界面查看今日纪念和历史记录

## 依赖服务

| 服务 | 说明 |
|------|------|
| [Immich](https://immich.app/) | 自托管照片管理，提供照片检索 API |
| [Ollama](https://ollama.com/) | 本地大模型推理，运行多模态和文本模型 |

## 快速开始

### 1. 准备 Ollama 模型

```bash
ollama pull qwen3-vl:4b      # 粗筛模型（多模态轻量，快速筛选）
ollama pull qwen3-vl:8b      # 主力模型（多模态，深度评分 + 画面描述）
ollama pull qwen3:8b          # 文案模型（纯文本，基于描述生成文案）
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 Immich URL 和 API Key
```

### 3. 安装并运行

```bash
npm install
npm run build
npm run start
```

访问 `http://localhost:3000` 查看 Web 界面。

### 开发模式

```bash
npm run start:dev
```

## 三模型架构

| 模型 | 配置项 | 用途 | 类型 |
|------|--------|------|------|
| qwen3-vl:4b | `OLLAMA_MODEL_SCREEN` | 粗筛：快速判断照片是否有纪念价值 | 多模态（轻量） |
| qwen3-vl:8b | `OLLAMA_MODEL_PRIMARY` | 深度评分：四维评分（情感/构图/历史/怀旧）+ 画面描述 | 多模态（主力） |
| qwen3:8b | `OLLAMA_MODEL_TEXT` | 文案生成：基于画面描述生成风格化纪念文案 | 纯文本 |

## 配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `IMMICH_URL` | `http://localhost:2283` | Immich 服务地址 |
| `IMMICH_API_KEY` | — | Immich API 密钥（必填） |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama 服务地址 |
| `OLLAMA_MODEL_PRIMARY` | `qwen3-vl:8b` | 深度评分 + 画面描述模型 |
| `OLLAMA_MODEL_SCREEN` | `qwen3-vl:4b` | 快速粗筛模型 |
| `OLLAMA_MODEL_TEXT` | `qwen3:8b` | 文案生成模型 |
| `OUTPUT_DIR` | `./output` | 纪念卡片输出目录 |
| `STYLE_PREFERENCE` | `classical` | 文案风格: classical / modern / nostalgic |
| `PORT` | `3000` | 服务端口 |
| `YEARS_BACK` | `5` | 向前追溯多少年 |
| `MAX_ASSETS` | `50` | 每年最多处理照片数 |
| `DATABASE_PATH` | `./data/memorials.db` | SQLite 数据库路径 |
| `CRON_SCHEDULE` | `0 4 * * *` | 定时任务 cron 表达式 |

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/api/memories/today` | 获取今日纪念（base64 图片） |
| POST | `/api/memories/regenerate` | 重新生成今日纪念 |
| GET | `/api/memories/history?limit=10&offset=0` | 历史记录（分页） |

## 技术栈

NestJS 10 · TypeScript · SQLite + TypeORM · Sharp · @immich/sdk · @nestjs/schedule

## 许可证

MIT
