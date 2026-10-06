import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

export const MEDIA_FOLDERS = ['avatars', 'menu', 'outlets', 'products', 'kyc', 'delivery-proof', 'reviews', 'banners'] as const;
export type MediaFolder = (typeof MEDIA_FOLDERS)[number];

export class PresignDto {
  @ApiProperty({ enum: MEDIA_FOLDERS }) @IsIn(MEDIA_FOLDERS) folder!: MediaFolder;
  @ApiProperty({ example: 'image/jpeg' })
  @Matches(/^(image\/(jpeg|png|webp)|application\/pdf)$/, { message: 'Unsupported content type' })
  contentType!: string;
  @ApiProperty({ example: 'paneer-tikka.jpg' }) @IsString() @MaxLength(200) fileName!: string;
}
