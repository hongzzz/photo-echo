import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

// 文字样式配置
export interface TextStyle {
  fontSize: number;
  color: string;
  position: 'top' | 'bottom' | 'center';
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  maxWidth: number;
  shadow: boolean;
  fontFamily: string;
}

// 预设风格
const stylePresets = {
  classical: {
    fontSize: 48,
    color: '#F5F5DC',       // 米色
    position: 'bottom' as const,
    align: 'center' as const,
    lineHeight: 1.6,
    maxWidth: 80,
    shadow: true,
    fontFamily: 'SimSun, Songti SC, serif', // 宋体
  },
  modern: {
    fontSize: 36,
    color: '#FFFFFF',      // 白色
    position: 'bottom' as const,
    align: 'center' as const,
    lineHeight: 1.4,
    maxWidth: 90,
    shadow: false,
    fontFamily: 'PingFang SC, Helvetica Neue, sans-serif',
  },
  nostalgic: {
    fontSize: 42,
    color: '#D2B48C',      // 棕褐色
    position: 'bottom' as const,
    align: 'center' as const,
    lineHeight: 1.5,
    maxWidth: 75,
    shadow: true,
    fontFamily: 'Kaiti SC, STKaiti, serif', // 楷体
  },
};

// 图像处理器类
export class ImageProcessor {
  /**
   * 文字换行处理
   */
  private wrapText(text: string, maxCharsPerLine: number): string[] {
    const lines: string[] = [];
    const paragraphs = text.split('\n');

    for (const paragraph of paragraphs) {
      if (paragraph.length <= maxCharsPerLine) {
        lines.push(paragraph);
      } else {
        let currentLine = '';
        const chars = paragraph.split('');

        for (const char of chars) {
          if ((currentLine + char).length > maxCharsPerLine) {
            if (currentLine.trim()) {
              lines.push(currentLine);
            }
            currentLine = char;
          } else {
            currentLine += char;
          }
        }

        if (currentLine.trim()) {
          lines.push(currentLine);
        }
      }
    }

    return lines;
  }

  /**
   * 创建文字 SVG
   */
  private createTextSVG(text: string, style: TextStyle, width: number): string {
    const lines = this.wrapText(text, style.maxWidth);
    const lineHeight = style.fontSize * style.lineHeight;
    const totalHeight = lines.length * lineHeight;

    let yOffset: number;
    if (style.position === 'bottom') {
      yOffset = 0;
    } else if (style.position === 'top') {
      yOffset = totalHeight + 40;
    } else {
      yOffset = -totalHeight / 2 + 40;
    }

    const textElements = lines.map((line, index) => {
      const y = yOffset + index * lineHeight + style.fontSize;
      const x = width / 2;  // 居中

      if (style.shadow) {
        return `
          <text x="${x + 2}" y="${y + 2}" font-family="${style.fontFamily}" font-size="${style.fontSize}"
                fill="rgba(0,0,0,0.5)" text-anchor="middle">${this.escapeXml(line)}</text>
          <text x="${x}" y="${y}" font-family="${style.fontFamily}" font-size="${style.fontSize}"
                fill="${style.color}" text-anchor="middle">${this.escapeXml(line)}</text>
        `;
      }

      return `
        <text x="${x}" y="${y}" font-family="${style.fontFamily}" font-size="${style.fontSize}"
              fill="${style.color}" text-anchor="middle">${this.escapeXml(line)}</text>
      `;
    }).join('');

    // 添加半透明背景
    const bgHeight = totalHeight + 60;
    const bgY = style.position === 'bottom' ? 0 : -bgHeight + 40;

    return `
      <svg width="${width}" height="${bgHeight}">
        <defs>
          <linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:rgba(0,0,0,0.7);stop-opacity:1" />
            <stop offset="100%" style="stop-color:rgba(0,0,0,0);stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect x="0" y="${bgY}" width="${width}" height="${bgHeight}" fill="url(#bgGradient)" />
        ${textElements}
      </svg>
    `;
  }

  /**
   * 转义 XML 特殊字符
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * 添加文字叠印
   */
  async addTextOverlay(
    imagePath: string,
    text: string,
    styleName: 'classical' | 'modern' | 'nostalgic' = 'classical'
  ): Promise<Buffer> {
    const style = stylePresets[styleName];

    // 获取图片尺寸
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    const width = metadata.width || 1200;

    // 创建文字 SVG
    const svg = this.createTextSVG(text, style, width);

    // 合成图片
    const outputBuffer = await sharp(imagePath)
      .composite([
        {
          input: Buffer.from(svg),
          gravity: style.position === 'bottom' ? 'south' : 'north',
        },
      ])
      .toBuffer();

    return outputBuffer;
  }

  /**
   * 创建纪念卡片
   */
  async createMemorialCard(
    imagePath: string,
    caption: string,
    styleName: 'classical' | 'modern' | 'nostalgic' = 'classical',
    outputPath?: string
  ): Promise<string> {
    // 处理图片并添加文字
    const processedBuffer = await this.addTextOverlay(imagePath, caption, styleName);

    // 如果没有指定输出路径，生成默认路径
    if (!outputPath) {
      const date = new Date().toISOString().split('T')[0];
      outputPath = path.join(process.cwd(), config.system.outputDir, `memorial_${date}.jpg`);
    }

    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 保存图片
    await sharp(processedBuffer)
      .jpeg({ quality: 90 })
      .toFile(outputPath);

    return outputPath;
  }

  /**
   * 创建带日期水印的纪念卡片
   */
  async createMemorialCardWithDate(
    imagePath: string,
    caption: string,
    date: Date,
    styleName: 'classical' | 'modern' | 'nostalgic' = 'classical',
    outputPath?: string
  ): Promise<string> {
    // 格式化日期
    const dateStr = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    const fullCaption = `${caption}\n\n—— ${dateStr} ——`;

    return this.createMemorialCard(imagePath, fullCaption, styleName, outputPath);
  }

  /**
   * 创建缩略图
   */
  async createThumbnail(imagePath: string, size: number = 400): Promise<Buffer> {
    return sharp(imagePath)
      .resize(size, size, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toBuffer();
  }
}

// 导出单例
export const imageProcessor = new ImageProcessor();
