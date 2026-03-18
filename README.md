# PhotoEcho

历史照片的回响 — 每天自动从 [Immich](https://immich.app/) 检索"历史上的今天"照片，通过本地 AI 筛选最有纪念价值的一张，生成风格化中文文案并合成纪念卡片。

所有处理在本地完成，照片不会上传到任何第三方服务。

## 功能

- 从 Immich 检索同月同日的历史照片（跨多年）
- 两阶段 AI 筛选：Moondream 快速粗筛 → Qwen3-VL 多维度精选
- 基于图像内容生成艺术风格中文纪念文案（古典 / 现代 / 怀旧）
- Sharp + SVG 合成带文字叠加的纪念卡片
- 每天凌晨 4 点自动执行，也可通过 Web 界面手动触发
- 单页 Web 界面查看今日纪念和历史记录

## 依赖服务

| 服务 | 说明 |
|------|------|
| [Immich](https://immich.app/) | 自托管照片管理，提供照片检索 API |
| [Ollama](https://ollama.com/) | 本地大模型推理，运行多模态视觉模型 |

## 快速开始

### 1. 准备 Ollama 模型

```bash
ollama pull moondream        # 粗筛模型 (1.8b, 快速)
ollama pull qwen3-vl:8b      # 主力模型 (中文理解强)
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

## 配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `IMMICH_URL` | `http://localhost:2283` | Immich 服务地址 |
| `IMMICH_API_KEY` | — | Immich API 密钥 (必填) |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama 服务地址 |
| `OLLAMA_MODEL_PRIMARY` | `qwen3-vl:8b` | 主力评分/文案模型 |
| `OLLAMA_MODEL_SCREEN` | `moondream:1.8b` | 快速粗筛模型 |
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
| GET | `/api/memories/today` | 获取今日纪念 (base64 图片) |
| POST | `/api/memories/regenerate` | 重新生成今日纪念 |
| GET | `/api/memories/history?limit=10&offset=0` | 历史记录 (分页) |

## 技术栈

NestJS 10 · TypeScript · SQLite + TypeORM · Sharp · @immich/sdk · @nestjs/schedule

## 许可证

私有项目
