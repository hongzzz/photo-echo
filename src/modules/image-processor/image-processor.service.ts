import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);
  private outputDir: string;

  constructor(private configService: ConfigService) {
    this.outputDir = this.configService.get<string>('app.system.outputDir') || './output';
    this.ensureOutputDir();
  }

  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

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

  private createTextSVG(text: string, style: any, width: number): string {
    const lines = this.wrapText(text, style.maxWidth);
    const lineHeight = style.fontSize * style.lineHeight;
    const totalHeight = lines.length * lineHeight;

    let yOffset = 0;
    if (style.position === 'top') {
      yOffset = totalHeight + 40;
    } else if (style.position === 'center') {
      yOffset = -totalHeight / 2 + 40;
    }

    const textElements = lines.map((line, index) => {
      const y = yOffset + index * lineHeight + style.fontSize;
      const x = width / 2;

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

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  async createMemorialCard(
    imagePath: string,
    caption: string,
    styleName: string = 'classical',
    outputPath?: string
  ): Promise<string> {
    const stylePresets = {
      classical: {
        fontSize: 48,
        color: '#F5F5DC',
        position: 'bottom',
        align: 'center',
        lineHeight: 1.6,
        maxWidth: 80,
        shadow: true,
        fontFamily: 'SimSun, Songti SC, serif',
      },
      modern: {
        fontSize: 36,
        color: '#FFFFFF',
        position: 'bottom',
        align: 'center',
        lineHeight: 1.4,
        maxWidth: 90,
        shadow: false,
        fontFamily: 'PingFang SC, Helvetica Neue, sans-serif',
      },
      nostalgic: {
        fontSize: 42,
        color: '#D2B48C',
        position: 'bottom',
        align: 'center',
        lineHeight: 1.5,
        maxWidth: 75,
        shadow: true,
        fontFamily: 'Kaiti SC, STKaiti, serif',
      },
    };

    const style = stylePresets[styleName as keyof typeof stylePresets] || stylePresets.classical;

    const image = sharp(imagePath);
    const metadata = await image.metadata();
    const width = metadata.width || 1200;

    const svg = this.createTextSVG(caption, style, width);

    const processedBuffer = await sharp(imagePath)
      .composite([
        {
          input: Buffer.from(svg),
          gravity: style.position === 'bottom' ? 'south' : 'north',
        },
      ])
      .toBuffer();

    if (!outputPath) {
      const date = new Date().toISOString().split('T')[0];
      outputPath = path.join(this.outputDir, `memorial_${date}.jpg`);
    }

    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    await sharp(processedBuffer)
      .jpeg({ quality: 90 })
      .toFile(outputPath);

    this.logger.log(`纪念卡片已保存: ${outputPath}`);
    return outputPath;
  }

  async createMemorialCardWithDate(
    imagePath: string,
    caption: string,
    date: Date,
    styleName: string = 'classical',
    outputPath?: string
  ): Promise<string> {
    const dateStr = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    const fullCaption = `${caption}\n\n—— ${dateStr} ——`;

    return this.createMemorialCard(imagePath, fullCaption, styleName, outputPath);
  }
}
