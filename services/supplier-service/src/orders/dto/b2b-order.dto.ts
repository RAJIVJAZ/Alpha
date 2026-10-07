import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { B2B_ORDER_STATUSES, B2bOrderStatus, PAYMENT_TERMS, PaymentTerms } from '@foodgrid/types';
import { PageQueryDto, ToArray } from '@foodgrid/utils/server';

export class B2bLineDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty({ description: 'Number of packs' }) @IsNumber() @Min(0.001) quantity!: number;
}

export class B2bAddressDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) contactPhone?: string;
  @ApiProperty() @IsString() @MaxLength(200) line1!: string;
  @ApiProperty() @IsString() @MaxLength(80) city!: string;
  @ApiProperty() @IsString() @MaxLength(80) state!: string;
  @ApiProperty() @Matches(/^\d{6}$/) pincode!: string;
  @ApiPropertyOptional() @IsOptional() @IsLatitude() lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsLongitude() lng?: number;
}

export class PlaceB2bOrderDto {
  @ApiProperty() @IsString() sellerTenantId!: string;
  @ApiProperty({ type: [B2bLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => B2bLineDto)
  items!: B2bLineDto[];
  @ApiProperty({ type: B2bAddressDto })
  @ValidateNested()
  @Type(() => B2bAddressDto)
  deliveryAddress!: B2bAddressDto;
  @ApiPropertyOptional() @IsOptional() @IsString() deliverySlotId?: string;
  @ApiPropertyOptional({ example: '2026-10-08' })
  @IsOptional()
  @IsDateString()
  deliveryDate?: string;
  @ApiPropertyOptional({ enum: PAYMENT_TERMS })
  @IsOptional()
  @IsIn(PAYMENT_TERMS)
  paymentTerms?: PaymentTerms;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ConfirmLineDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty() @IsNumber() @Min(0) confirmedQty!: number;
}

export class ConfirmB2bOrderDto {
  @ApiPropertyOptional({
    type: [ConfirmLineDto],
    description: 'Omit to confirm everything as ordered',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmLineDto)
  lines?: ConfirmLineDto[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() expectedDeliveryAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class RejectDto {
  @ApiProperty() @IsString() @MaxLength(500) reason!: string;
}

export class DispatchDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) vehicleNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) driverName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) driverPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() eta?: string;
}

export class LocationDto {
  @ApiProperty() @IsLatitude() lat!: number;
  @ApiProperty() @IsLongitude() lng!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class RateSellerDto {
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) rating!: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  qualityRating?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() onTime?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

export class ListB2bOrdersDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: B2B_ORDER_STATUSES, isArray: true })
  @IsOptional()
  @ToArray()
  @IsArray()
  @IsIn(B2B_ORDER_STATUSES, { each: true })
  status?: B2bOrderStatus[];
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
}
