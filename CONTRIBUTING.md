# Contributing to PhotoEcho

感谢你对 PhotoEcho 的关注！欢迎提交 Issue 和 Pull Request。

## 前置条件

- Node.js 20+
- pnpm
- 运行中的 [Immich](https://immich.app/) 实例
- 运行中的 [Ollama](https://ollama.com/) 实例（需下载所需模型）

## 开发环境搭建

```bash
# 克隆仓库
git clone https://github.com/your-username/photo-echo.git
cd photo-echo

# 安装依赖
pnpm install

# 复制并编辑环境配置
cp .env.example .env
# 编辑 .env 填入你的 Immich URL 和 API Key

# 下载 Ollama 模型
ollama pull qwen3-vl:4b
ollama pull qwen3-vl:8b
ollama pull qwen3:8b

# 启动开发服务
pnpm run start:dev
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm run start:dev` | 开发模式（文件监听） |
| `pnpm run build` | 编译项目 |
| `pnpm run test` | 运行测试 |
| `pnpm run test:watch` | 测试监听模式 |
| `pnpm exec tsc --noEmit` | 类型检查 |

## 代码规范

- 使用 TypeScript strict 模式，避免 `any` 类型
- 遵循 NestJS 模块化架构模式
- 日志使用 NestJS 内置 Logger
- DTO 使用 class-validator 装饰器进行校验

## 添加新的文案风格

在 `src/modules/image-processor/image-processor.service.ts` 的 `stylePresets` 对象中添加新条目：

```typescript
your_style: {
  fontSize: 48,
  color: '#FFFFFF',
  dateColor: '#CCCCCC',
  position: 'bottom',
  align: 'center',
  lineHeight: 1.8,
  maxWidth: 18,
  shadow: true,
  textOpacity: 0.9,
  letterSpacing: 4,
  fontFamily: 'Your Font, fallback-font, serif',
},
```

同时在 `src/modules/ollama/ollama.service.ts` 的 `styleGuide` 中添加对应的文案风格描述。

## Pull Request 流程

1. Fork 仓库并创建特性分支
2. 确保 `pnpm run test` 和 `pnpm exec tsc --noEmit` 通过
3. 提交 PR 并描述你的更改
