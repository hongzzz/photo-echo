import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { join } from 'path';
import * as fs from 'fs';

@Controller()
export class AppController {
  // 首页由 ServeStaticModule 提供 /public/index.html
  // 此处不定义根路由，避免与 ServeStaticModule 冲突
}
