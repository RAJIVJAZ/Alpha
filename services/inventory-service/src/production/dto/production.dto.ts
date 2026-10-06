import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class GeneratePlanDto {
  @ApiProperty() @IsString() outletId!: string;
  @ApiProperty({ example: '2026-10-07' }) @IsDateString() date!: string;
  @ApiPropertyOptional({ default: 10, description: 'Safety buffer %' }) @IsOptional() @IsNumber() @Min(0) @Max(100) bufferPct?: number;
}

export class UpdatePlanItemDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) plannedQty?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) producedQty?: number;
}
