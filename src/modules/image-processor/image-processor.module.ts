import { Module, Global } from '@nestjs/common';
import { ImageProcessorService } from './image-processor.service';

@Global()
@Module({
  providers: [ImageProcessorService],
  exports: [ImageProcessorService],
})
export class ImageProcessorModule {}
