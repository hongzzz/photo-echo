import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import { MemoriesService } from '../memories/memories.service';

@Controller('health')
export class HealthController {
  constructor(
    private memoriesService: MemoriesService,
    private configService: ConfigService,
  ) {}

  @Get()
  async check() {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const [todayMemorial, ollamaOk, immichOk] = await Promise.all([
      this.memoriesService.getTodayMemorial(),
      this.checkOllama(),
      this.checkImmich(),
    ]);

    const allOk = ollamaOk && immichOk;

    return {
      status: allOk ? 'ok' : 'degraded',
      date: today,
      hasImage: todayMemorial.success,
      services: {
        ollama: ollamaOk ? 'ok' : 'unreachable',
        immich: immichOk ? 'ok' : 'unreachable',
      },
    };
  }

  private checkOllama(): Promise<boolean> {
    const host = this.configService.get<string>('app.ollama.host') || 'http://localhost:11434';
    return this.httpGet(host, 3000);
  }

  private checkImmich(): Promise<boolean> {
    const url = this.configService.get<string>('app.immich.url') || 'http://localhost:2283';
    return this.httpGet(`${url}/api/server/ping`, 3000);
  }

  private httpGet(urlStr: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const url = new URL(urlStr);
        const req = http.get({ hostname: url.hostname, port: url.port, path: url.pathname, timeout: timeoutMs }, (res) => {
          res.resume();
          resolve(res.statusCode < 500);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
      } catch {
        resolve(false);
      }
    });
  }
}
