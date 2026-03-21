import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);

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

  private calcMaxCharsPerLine(width: number, fontSize: number, letterSpacing: number): number {
    const horizontalPadding = 80; // 左右各 40px 留白
    const charWidth = fontSize + (letterSpacing || 0);
    const maxChars = Math.floor((width - horizontalPadding) / charWidth);
    return Math.max(4, maxChars); // 至少 4 个字
  }

  private createTextSVG(text: string, style: any, width: number, height: number): string {
    const maxCharsPerLine = this.calcMaxCharsPerLine(width, style.fontSize, style.letterSpacing);
    const allLines = this.wrapText(text, maxCharsPerLine);

    const dateLineIndex = allLines.findIndex(l => this.isDateLine(l));
    const captionLines = dateLineIndex >= 0 ? allLines.slice(0, dateLineIndex) : allLines;
    const dateLine = dateLineIndex >= 0 ? allLines[dateLineIndex] : null;

    const filteredCaptionLines = captionLines.filter(l => l.trim() !== '');

    const lineHeight = style.fontSize * style.lineHeight;
    const dateSize = Math.round(style.fontSize * 0.5);
    const dateLineHeight = dateSize * 2;
    const letterSpacing = style.letterSpacing || 0;

    // Layout calculation
    const paddingBottom = 56;
    const paddingBetween = dateLine ? 28 : 0;
    const captionHeight = filteredCaptionLines.length * lineHeight;
    const dateHeight = dateLine ? dateLineHeight : 0;
    const contentHeight = captionHeight + paddingBetween + dateHeight + paddingBottom;
    const gradientHeight = Math.min(contentHeight + 160, height * 0.6);

    const bgHeight = gradientHeight;
    const x = width / 2;

    // Build text elements from bottom up
    let currentY = bgHeight - paddingBottom;

    // Date line
    let dateElement = '';
    if (dateLine) {
      const cleanDate = dateLine.replace(/^——\s*/, '').replace(/\s*——$/, '');
      dateElement = `
        <text x="${x}" y="${currentY}" font-family="${style.fontFamily}" font-size="${dateSize}"
              fill="${style.dateColor}" fill-opacity="0.5" text-anchor="middle"
              letter-spacing="4">${this.escapeXml(cleanDate)}</text>
      `;
      currentY -= dateLineHeight + paddingBetween;
    }

    // Decorative separator
    let separatorElement = '';
    if (dateLine) {
      const dotSpacing = 8;
      const dotCount = 3;
      const startX = x - (dotCount - 1) * dotSpacing / 2;
      const dots = Array.from({ length: dotCount }, (_, i) =>
        `<circle cx="${startX + i * dotSpacing}" cy="${currentY + 10}" r="1.2" fill="${style.color}" fill-opacity="0.25" />`
      ).join('');
      separatorElement = dots;
    }

    // Caption lines
    const captionElements = filteredCaptionLines.map((line, index) => {
      const y = currentY - (filteredCaptionLines.length - 1 - index) * lineHeight;

      let shadow = '';
      if (style.shadow) {
        shadow = `
          <text x="${x}" y="${y}" font-family="${style.fontFamily}" font-size="${style.fontSize}"
                fill="rgba(0,0,0,0.6)" text-anchor="middle" letter-spacing="${letterSpacing}"
                filter="url(#textShadow)">${this.escapeXml(line)}</text>
        `;
      }

      return `
        ${shadow}
        <text x="${x}" y="${y}" font-family="${style.fontFamily}" font-size="${style.fontSize}"
              fill="${style.color}" fill-opacity="${style.textOpacity || 1}" text-anchor="middle"
              letter-spacing="${letterSpacing}">${this.escapeXml(line)}</text>
      `;
    }).join('');

    return `
      <svg width="${width}" height="${bgHeight}">
        <defs>
          <linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="rgba(0,0,0,0)" />
            <stop offset="25%" stop-color="rgba(0,0,0,0.08)" />
            <stop offset="50%" stop-color="rgba(0,0,0,0.35)" />
            <stop offset="75%" stop-color="rgba(0,0,0,0.6)" />
            <stop offset="100%" stop-color="rgba(0,0,0,0.78)" />
          </linearGradient>
          <filter id="textShadow" x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
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
  ): Promise<Buffer> {
    const stylePresets = {
      classical: {
        fontSize: 52,
        color: '#F0EBE1',
        dateColor: '#D4C9B8',
        position: 'bottom',
        align: 'center',
        lineHeight: 1.9,
        maxWidth: 16,
        shadow: true,
        textOpacity: 0.92,
        letterSpacing: 6,
        fontFamily: 'Songti SC, SimSun, serif',
      },
      modern: {
        fontSize: 44,
        color: '#FFFFFF',
        dateColor: '#CCCCCC',
        position: 'bottom',
        align: 'center',
        lineHeight: 1.7,
        maxWidth: 20,
        shadow: true,
        textOpacity: 0.88,
        letterSpacing: 3,
        fontFamily: 'PingFang SC, Helvetica Neue, sans-serif',
      },
      nostalgic: {
        fontSize: 48,
        color: '#E8D5B7',
        dateColor: '#C4AB85',
        position: 'bottom',
        align: 'center',
        lineHeight: 1.8,
        maxWidth: 18,
        shadow: true,
        textOpacity: 0.9,
        letterSpacing: 5,
        fontFamily: 'Kaiti SC, STKaiti, serif',
      },
    };

    const style = stylePresets[styleName as keyof typeof stylePresets] || stylePresets.classical;

    const image = sharp(imagePath);
    const metadata = await image.metadata();
    const width = metadata.width || 1200;
    const height = metadata.height || 800;

    const svg = this.createTextSVG(caption, style, width, height);

    const buffer = await sharp(imagePath)
      .composite([
        {
          input: Buffer.from(svg),
          gravity: style.position === 'bottom' ? 'south' : 'north',
        },
      ])
      .jpeg({ quality: 92 })
      .toBuffer();

    this.logger.log(`纪念卡片已生成 (${(buffer.length / 1024).toFixed(0)} KB)`);
    return buffer;
  }

  async createMemorialCardWithDate(
    imagePath: string,
    caption: string,
    date: Date,
    styleName: string = 'classical',
  ): Promise<Buffer> {
    const dateStr = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    const fullCaption = `${caption}\n\n—— ${dateStr} ——`;

    return this.createMemorialCard(imagePath, fullCaption, styleName);
  }
}
