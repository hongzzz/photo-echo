export class CreateMemoryDto {
  date: string;
  imagePath: string;
  caption?: string;
  sourceAssetId?: string;
  sourceFileName?: string;
  score?: number;
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
  limit?: number;
  offset?: number;
}
