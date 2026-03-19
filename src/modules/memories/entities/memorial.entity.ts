import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity()
export class Memorial {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  date: string; // YYYY-MM-DD 格式

  @Column()
  imagePath: string; // 纪念卡片文件路径

  @Column({ nullable: true })
  caption: string; // 纪念文案

  @Column({ nullable: true })
  sourceAssetId: string; // 来源照片 ID

  @Column({ nullable: true })
  sourceFileName: string; // 来源文件名

  @Column({ type: 'float', nullable: true })
  score: number; // AI 评分

  @Column({ nullable: true })
  style: string; // 风格: classical, modern, nostalgic

  @CreateDateColumn()
  createdAt: Date;
}
