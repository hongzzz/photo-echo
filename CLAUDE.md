# AI Photo Selector - 私有化媒体纪念系统

## 项目概述

基于 Apple Silicon M1 Pro 的本地化媒体纪念系统，从 Immich 检索"历史上的今天"照片，使用 Ollama 多模态模型进行语义评价和筛选，生成艺术风格化中文纪念文案，并合成带有文字的图片。

## 技术栈

- **运行时**: Node.js + TypeScript
- **照片管理**: Immich (自托管)
- **AI 推理**: Ollama (本地多模态模型)
- **图像处理**: Sharp
- **定时任务**: macOS launchd

## 项目结构

```
ai-photo-selector/
├── src/
│   ├── config.ts              # 配置管理（环境变量）
│   ├── services/
│   │   ├── immich.ts           # Immich API 客户端
│   │   ├── ollama.ts           # Ollama 推理引擎
│   │   └── imageProcessor.ts  # 图像处理模块
│   └── index.ts                # 主调度器
├── package.json
├── tsconfig.json
├── .env.example
└── com.user.photo-memories.plist  # launchd 配置
```

## 核心功能

1. **照片检索**: 从 Immich 获取特定日期的历史照片
2. **AI 筛选**: Moondream 粗筛 → Qwen3-VL 精选
3. **文案生成**: 基于图像内容生成艺术风格中文文案
4. **图片合成**: Sharp 处理，文字叠加生成纪念卡片

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

# 输出
OUTPUT_DIR=./output
STYLE_PREFERENCE=classical  # classical | modern | nostalgic
```

## 开发命令

```bash
# 安装依赖
npm install

# 编译 TypeScript
npm run build

# 运行
npm run start

# 开发模式（监听）
npm run dev
```

## Ollama 模型准备

首次运行前需下载模型：

```bash
# 粗筛模型（快速）
ollama pull moondream

# 主力模型（中文理解强）
ollama pull qwen3-vl:7b
```

## 定时任务配置

```bash
# 加载 launchd 配置
launchctl load com.user.photo-memories.plist

# 卸载
launchctl unload com.user.photo-memories.plist
```

## 设计原则

- **隐私优先**: 所有处理在本地完成，不上传照片到第三方
- **模块化**: 各服务独立，便于测试和替换
- **可配置**: 支持多种文案风格和输出格式

## 注意事项

- M1 Pro 统一内存有限，建议使用 4-bit 量化模型
- Ollama 模型首次加载需 5-8 秒，后续推理约 30 秒/张
- 建议每日定时运行，避免频繁唤醒模型
