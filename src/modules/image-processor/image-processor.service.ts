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

  private isDateLine(line: string): boolean {
    return /^——.*——$/.test(line.trim());
  }

  private createTextSVG(text: string, style: any, width: number): string {
    const allLines = this.wrapText(text, style.maxWidth);

    // Separate caption lines from date line
    const dateLineIndex = allLines.findIndex(l => this.isDateLine(l));
    const captionLines = dateLineIndex >= 0 ? allLines.slice(0, dateLineIndex) : allLines;
    const dateLine = dateLineIndex >= 0 ? allLines[dateLineIndex] : null;

    // Filter out empty lines between caption and date
    const filteredCaptionLines = captionLines.filter(l => l.trim() !== '');

    const lineHeight = style.fontSize * style.lineHeight;
    const dateSize = Math.round(style.fontSize * 0.55);
    const dateLineHeight = dateSize * 1.8;
    const letterSpacing = style.letterSpacing || 0;

    // Layout calculation
    const paddingBottom = 50;
    const paddingBetween = dateLine ? 24 : 0;
    const captionHeight = filteredCaptionLines.length * lineHeight;
    const dateHeight = dateLine ? dateLineHeight : 0;
    const contentHeight = captionHeight + paddingBetween + dateHeight + paddingBottom;
    const gradientHeight = contentHeight + 120; // extra space for gradient fade

    const bgHeight = gradientHeight;
    const x = width / 2;

    // Build text elements from bottom up
    let currentY = bgHeight - paddingBottom;

    // Date line (at very bottom)
    let dateElement = '';
    if (dateLine) {
      const cleanDate = dateLine.replace(/^——\s*/, '').replace(/\s*——$/, '');
      dateElement = `
        <text x="${x}" y="${currentY}" font-family="${style.fontFamily}" font-size="${dateSize}"
              fill="${style.color}" fill-opacity="0.6" text-anchor="middle"
              letter-spacing="3">${this.escapeXml(cleanDate)}</text>
      `;
      currentY -= dateLineHeight + paddingBetween;
    }

    // Decorative thin line separator
    let separatorElement = '';
    if (dateLine) {
      const lineWidth = Math.min(width * 0.2, 120);
      separatorElement = `
        <line x1="${x - lineWidth / 2}" y1="${currentY + 8}" x2="${x + lineWidth / 2}" y2="${currentY + 8}"
              stroke="${style.color}" stroke-opacity="0.3" stroke-width="0.8" />
      `;
    }

    // Caption lines (bottom-to-top)
    const captionElements = filteredCaptionLines.map((line, index) => {
      const y = currentY - (filteredCaptionLines.length - 1 - index) * lineHeight;
      const shadowBlur = style.shadow ? 6 : 0;

      let shadow = '';
      if (style.shadow) {
        shadow = `
          <text x="${x}" y="${y}" font-family="${style.fontFamily}" font-size="${style.fontSize}"
                fill="rgba(0,0,0,0.7)" text-anchor="middle" letter-spacing="${letterSpacing}"
                filter="url(#textShadow)">${this.escapeXml(line)}</text>
        `;
      }

      return `
        ${shadow}
        <text x="${x}" y="${y}" font-family="${style.fontFamily}" font-size="${style.fontSize}"
              fill="${style.color}" text-anchor="middle" letter-spacing="${letterSpacing}">${this.escapeXml(line)}</text>
      `;
    }).join('');

    return `
      <svg width="${width}" height="${bgHeight}">
        <defs>
          <linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="rgba(0,0,0,0)" />
            <stop offset="35%" stop-color="rgba(0,0,0,0.15)" />
            <stop offset="65%" stop-color="rgba(0,0,0,0.5)" />
            <stop offset="100%" stop-color="rgba(0,0,0,0.75)" />
          </linearGradient>
          <filter id="textShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
          </filter>
        </defs>
        <rect x="0" y="0" width="${width}" height="${bgHeight}" fill="url(#bgGradient)" />
        ${captionElements}
        ${separatorElement}
        ${dateElement}
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
        fontSize: 42,
        color: '#F5F0E8',
        position: 'bottom',
        align: 'center',
        lineHeight: 1.8,
        maxWidth: 20,
        shadow: true,
        letterSpacing: 4,
        fontFamily: 'Songti SC, SimSun, serif',
      },
      modern: {
        fontSize: 34,
        color: '#FFFFFF',
        position: 'bottom',
        align: 'center',
        lineHeight: 1.6,
        maxWidth: 24,
        shadow: true,
        letterSpacing: 2,
        fontFamily: 'PingFang SC, Helvetica Neue, sans-serif',
      },
      nostalgic: {
        fontSize: 38,
        color: '#E8D5B7',
        position: 'bottom',
        align: 'center',
        lineHeight: 1.7,
        maxWidth: 22,
        shadow: true,
        letterSpacing: 3,
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
