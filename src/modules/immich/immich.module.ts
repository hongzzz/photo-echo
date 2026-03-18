import { Module, Global } from '@nestjs/common';
import { ImmichService } from './immich.service';

@Global()
@Module({
  providers: [ImmichService],
  exports: [ImmichService],
})
export class ImmichModule {}
