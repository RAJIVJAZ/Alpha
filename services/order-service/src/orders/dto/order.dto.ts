import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
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
import { ORDER_STATUSES, OrderStatus, PaymentMethod } from '@foodgrid/types';
import { DateRangeQueryDto, PageQueryDto, ToArray } from '@foodgrid/utils/server';

export const ONLINE_ORDER_TYPES = ['DELIVERY', 'TAKEAWAY'] as const;
export const CHECKOUT_METHODS: PaymentMethod[] = ['UPI', 'CARD', 'NETBANKING', 'WALLET', 'COD'];

export class AddressSnapshotDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) label?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) contactPhone?: string;
  @ApiProperty() @IsString() @MaxLength(200) line1!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) line2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) landmark?: string;
  @ApiProperty() @IsString() @MaxLength(80) city!: string;
  @ApiProperty() @IsString() @MaxLength(80) state!: string;
  @ApiProperty() @Matches(/^\d{6}$/) pincode!: string;
  @ApiProperty() @IsLatitude() lat!: number;
  @ApiProperty() @IsLongitude() lng!: number;
}

export class QuoteDto {
  @ApiProperty({ enum: ONLINE_ORDER_TYPES })
  @IsIn(ONLINE_ORDER_TYPES)
  orderType!: (typeof ONLINE_ORDER_TYPES)[number];
  @ApiPropertyOptional() @IsOptional() @IsLatitude() lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsLongitude() lng?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  tip?: number;
  @ApiPropertyOptional({ enum: CHECKOUT_METHODS })
  @IsOptional()
  @IsIn(CHECKOUT_METHODS)
  paymentMethod?: PaymentMethod;
}

export class CheckoutDto {
  @ApiProperty({ enum: ONLINE_ORDER_TYPES })
  @IsIn(ONLINE_ORDER_TYPES)
  orderType!: (typeof ONLINE_ORDER_TYPES)[number];
  @ApiProperty({ enum: CHECKOUT_METHODS }) @IsIn(CHECKOUT_METHODS) paymentMethod!: PaymentMethod;
  @ApiPropertyOptional({ type: AddressSnapshotDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressSnapshotDto)
  deliveryAddress?: AddressSnapshotDto;
  @ApiPropertyOptional({ minimum: 0, maximum: 500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  tip?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) specialInstructions?: string;
  @ApiPropertyOptional({ description: 'Schedule for later (ISO time, 45 min – 7 days ahead)' })
  @IsOptional()
  @IsDateString()
  scheduledFor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128) deviceId?: string;
}

export class CancelOrderDto {
  @ApiProperty() @IsString() @MaxLength(300) reason!: string;
}

export class AcceptOrderDto {
  @ApiPropertyOptional({ minimum: 5, maximum: 120, description: 'Override preparation time' })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  prepTimeMins?: number;
}

export class ListOrdersDto extends PageQueryDto {
  @ApiPropertyOptional({
    description: 'Comma separated statuses',
    enum: ORDER_STATUSES,
    isArray: true,
  })
  @IsOptional()
  @ToArray()
  @IsArray()
  @IsIn(ORDER_STATUSES, { each: true })
  status?: OrderStatus[];
}

export class MerchantOrdersQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() outletId?: string;
  @ApiPropertyOptional({ enum: ORDER_STATUSES, isArray: true })
  @IsOptional()
  @ToArray()
  @IsArray()
  @IsIn(ORDER_STATUSES, { each: true })
  status?: OrderStatus[];
  @ApiPropertyOptional({ description: 'Order number search' }) @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class ReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) rating!: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  foodRating?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  deliveryRating?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) comment?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];
  @ApiPropertyOptional({ type: [String], example: ['Tasty', 'Well packed'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
