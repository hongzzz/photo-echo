import { IsString, IsOptional, IsNumber, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMemoryDto {
  @IsString()
  date: string;

  @IsString()
  imagePath: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsString()
  sourceAssetId?: string;

  @IsOptional()
  @IsString()
  sourceFileName?: string;

  @IsOptional()
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsString()
  style?: string;
}

export class MemoryResponseDto {
  success: boolean;
  date?: string;
  image?: string;
  filename?: string;
  caption?: string;
  message?: string;
}

export class HistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
