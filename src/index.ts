import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import { config, ensureOutputDir, validateConfig } from './config';
import { immichClient, Asset } from './services/immich';
import { ollamaClient, MemoryScore } from './services/ollama';
import { imageProcessor } from './services/imageProcessor';

// 类型定义
interface ProcessedAsset extends Asset {
  tempPath?: string;
  score?: MemoryScore;
}

// 全局状态
let todayMemorialImage: string | null = null;
let todayDate: string = '';

/**
 * 主处理流程
 */
async function processMemories(): Promise<string | null> {
  console.log('='.repeat(50));
  console.log('开始处理今日回忆...');
  console.log('='.repeat(50));

  const today = new Date();
  todayDate = today.toISOString().split('T')[0];

  try {
    // 1. 获取历史照片（通过相册方式）
    console.log('\n[1/7] 检索历史照片...');
    const assets = await immichClient.getHistoricalPhotosFromAlbums(
      today,
      config.system.daysLookback
    );

    if (assets.length === 0) {
      console.log('未找到历史照片');
      return null;
    }

    console.log(`找到 ${assets.length} 张历史照片`);

    // 2. 创建临时目录
    const tempDir = path.join(process.cwd(), '.temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // 3. 下载并粗筛照片
    console.log('\n[2/7] 下载并筛选照片...');
    const processedAssets: ProcessedAsset[] = [];

    for (const asset of assets.slice(0, config.system.maxAssets)) {
      const tempPath = path.join(tempDir, `${asset.id}.jpg`);

      try {
        // 下载缩略图
        await immichClient.getThumbnail(asset.id, tempPath);

        // 快速筛选
        const isWorth = await ollamaClient.quickScreen(tempPath);

        if (isWorth) {
          processedAssets.push({
            ...asset,
            tempPath,
          });
        } else {
          // 删除不合格的图片
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        }
      } catch (error) {
        console.error(`处理图片 ${asset.id} 失败:`, error);
      }
    }

    if (processedAssets.length === 0) {
      console.log('没有通过筛选的照片');
      return null;
    }

    console.log(`通过粗筛 ${processedAssets.length} 张照片`);

    // 4. 深度评分和选择
    console.log('\n[3/7] 深度评分...');
    let bestAsset: ProcessedAsset | null = null;
    let bestScore = 0;

    for (const asset of processedAssets) {
      if (asset.tempPath) {
        const score = await ollamaClient.deepScoreMemoryValue(asset.tempPath);
        asset.score = score;

        console.log(`  - ${asset.originalFileName}: ${score.overall}/10`);

        if (score.overall > bestScore) {
          bestScore = score.overall;
          bestAsset = asset;
        }
      }
    }

    if (!bestAsset || !bestAsset.tempPath) {
      console.log('未能选择最佳照片');
      return null;
    }

    console.log(`\n最佳照片: ${bestAsset.originalFileName} (${bestScore}/10)`);

    // 5. 生成纪念文案
    console.log('\n[4/7] 生成纪念文案...');
    const captionResult = await ollamaClient.generateCaption(
      bestAsset.tempPath,
      config.system.stylePreference
    );

    console.log(`生成的文案: ${captionResult.caption}`);

    // 6. 合成纪念图片
    console.log('\n[5/7] 合成纪念图片...');
    const outputDir = ensureOutputDir();
    const outputPath = path.join(
      outputDir,
      `memorial_${todayDate}.jpg`
    );

    const finalPath = await imageProcessor.createMemorialCardWithDate(
      bestAsset.tempPath,
      captionResult.caption,
      today,
      config.system.stylePreference,
      outputPath
    );

    console.log(`纪念图片已保存: ${finalPath}`);

    // 7. 清理临时文件
    console.log('\n[6/7] 清理临时文件...');
    for (const asset of processedAssets) {
      if (asset.tempPath && fs.existsSync(asset.tempPath)) {
        fs.unlinkSync(asset.tempPath);
      }
    }

    // 保存今日纪念图片路径
    todayMemorialImage = finalPath;

    console.log('\n' + '='.repeat(50));
    console.log('处理完成!');
    console.log('='.repeat(50));

    return finalPath;
  } catch (error) {
    console.error('处理失败:', error);
    return null;
  }
}

/**
 * HTTP 请求处理
 */
function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  const parsedUrl = url.parse(req.url || '', true);
  const pathname = parsedUrl.pathname;

  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API 路由
  if (pathname === '/api/today') {
    // 获取今日纪念图片
    res.setHeader('Content-Type', 'application/json');

    if (todayMemorialImage && fs.existsSync(todayMemorialImage)) {
      const imageBuffer = fs.readFileSync(todayMemorialImage);
      const base64 = imageBuffer.toString('base64');
      const ext = path.extname(todayMemorialImage).slice(1);
      const mimeType = ext === 'jpg' ? 'jpeg' : ext;

      res.writeHead(200, {
        'Content-Type': 'application/json',
      });
      res.end(JSON.stringify({
        success: true,
        date: todayDate,
        image: `data:image/${mimeType};base64,${base64}`,
        filename: path.basename(todayMemorialImage),
      }));
    } else {
      res.writeHead(200, {
        'Content-Type': 'application/json',
      });
      res.end(JSON.stringify({
        success: false,
        message: '今日纪念图片尚未生成',
        date: todayDate,
      }));
    }
  } else if (pathname === '/api/regenerate') {
    // 重新生成纪念图片
    res.setHeader('Content-Type', 'application/json');

    processMemories().then((result) => {
      if (result) {
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          message: '纪念图片已重新生成',
          path: result,
        }));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify({
          success: false,
          message: '生成失败或没有可用照片',
        }));
      }
    });
  } else if (pathname === '/health') {
    // 健康检查
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ok',
      date: todayDate,
      hasImage: !!todayMemorialImage,
    }));
  } else if (pathname === '/') {
    // 根路径返回简单页面
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.writeHead(200);
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>AI 照片纪念系统</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1 { color: #333; }
    .card {
      background: white;
      border-radius: 12px;
      padding: 30px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .status { color: #666; margin: 20px 0; }
    .btn {
      display: inline-block;
      padding: 10px 20px;
      background: #007aff;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      margin: 5px;
    }
    .btn:hover { background: #0056b3; }
    img { max-width: 100%; border-radius: 8px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>AI 照片纪念系统</h1>
    <div class="status">
      <p>日期: ${todayDate || '未设置'}</p>
      <p>状态: ${todayMemorialImage ? '已生成纪念图片' : '等待生成'}</p>
    </div>
    <a href="/api/today" class="btn">获取今日纪念</a>
    <a href="/api/regenerate" class="btn">重新生成</a>
    <div id="image-container"></div>
  </div>
  <script>
    fetch('/api/today')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.image) {
          document.getElementById('image-container').innerHTML =
            '<img src="' + data.image + '" alt="今日纪念">';
        }
      });
  </script>
</body>
</html>
    `);
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
}

/**
 * 启动 HTTP 服务器
 */
function startServer(): void {
  const port = config.system.port;
  const server = http.createServer(handleRequest);

  server.listen(port, () => {
    console.log(`HTTP 服务器已启动: http://localhost:${port}`);
    console.log('可用 API:');
    console.log(`  GET /            - 查看主页`);
    console.log(`  GET /health      - 健康检查`);
    console.log(`  GET /api/today   - 获取今日纪念图片`);
    console.log(`  GET /api/regenerate - 重新生成纪念图片`);
  });
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log('AI 照片纪念系统启动中...');

  // 验证配置
  try {
    validateConfig();
  } catch (error) {
    console.error('配置验证失败:', error);
    process.exit(1);
  }

  // 确保输出目录存在
  ensureOutputDir();

  // 启动 HTTP 服务器
  startServer();

  // 首次运行处理
  await processMemories();
}

// 运行主函数
main().catch(console.error);
