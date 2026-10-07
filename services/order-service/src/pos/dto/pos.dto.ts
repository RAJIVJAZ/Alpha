import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderLineDto {
  @ApiProperty() @IsString() menuItemId!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(99) quantity!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() variantId?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  addonIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) notes?: string;
}

export class PosOrderDto {
  @ApiProperty() @IsString() outletId!: string;
  @ApiProperty({ type: [OrderLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items!: OrderLineDto[];
  @ApiProperty({ enum: ['CASH', 'UPI', 'CARD'] }) @IsIn(['CASH', 'UPI', 'CARD']) paymentMethod!:
    'CASH' | 'UPI' | 'CARD';
  @ApiProperty({ enum: ['TAKEAWAY', 'DINE_IN'] }) @IsIn(['TAKEAWAY', 'DINE_IN']) orderType!:
    'TAKEAWAY' | 'DINE_IN';
  @ApiPropertyOptional() @IsOptional() @IsString() tableId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) customerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) customerPhone?: string;
  @ApiPropertyOptional({ description: 'Manual flat discount (₹)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

export class PosSummaryQueryDto {
  @ApiProperty() @IsString() outletId!: string;
  @ApiPropertyOptional({
    example: '2026-10-06',
    description: 'Business date (IST); defaults to today',
  })
  @IsOptional()
  @IsDateString()
  date?: string;
}

const RUPEES = 'Rupees as a decimal string with two decimals';

class PosHourDto {
  @ApiProperty({ minimum: 0, maximum: 23, description: 'Hour of the IST business day' })
  hour!: number;
  @ApiProperty({ description: 'Orders placed in that hour' }) orders!: number;
  @ApiProperty({ example: '1240.00', description: `Sales in that hour. ${RUPEES}` })
  sales!: string;
}

class PosTopItemDto {
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Units sold' }) quantity!: number;
  @ApiProperty({ example: '2400.00', description: `Item sales before discounts. ${RUPEES}` })
  sales!: string;
}

/** Response of GET pos/summary (documentation only; field names are a client contract). */
export class PosSummaryDto {
  @ApiProperty({ example: '2026-10-06', description: 'IST business day' }) date!: string;
  @ApiProperty({ description: 'Orders counted in the sales (cancelled and rejected excluded)' })
  orders!: number;
  @ApiProperty({ description: 'Cancelled or rejected orders that day' }) cancelled!: number;
  @ApiProperty({ example: '18450.00', description: `Order totals incl. GST. ${RUPEES}` })
  grossSales!: string;
  @ApiProperty({ example: '880.00', description: `GST collected. ${RUPEES}` })
  taxCollected!: string;
  @ApiProperty({ example: '350.00', description: `Coupon and manual discounts. ${RUPEES}` })
  discounts!: string;
  @ApiProperty({ example: '410.00', description: `grossSales / orders. ${RUPEES}` })
  averageTicket!: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { UPI: '9800.00', CASH: '6150.00', CARD: '2500.00' },
    description: `Sales amount per payment method (UNPAID when none), not order counts. ${RUPEES}`,
  })
  byPaymentMethod!: Record<string, string>;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { POS: '12000.00', APP: '5200.00', QR: '1250.00' },
    description: `Sales amount per order channel, not order counts. ${RUPEES}`,
  })
  byChannel!: Record<string, string>;
  @ApiProperty({ type: [PosHourDto], description: 'All 24 hours of the IST day' })
  hourly!: PosHourDto[];
  @ApiProperty({ type: [PosTopItemDto], description: 'Ten best sellers by units' })
  topItems!: PosTopItemDto[];
}
