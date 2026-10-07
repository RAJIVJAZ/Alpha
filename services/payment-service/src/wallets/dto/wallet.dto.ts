import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PageQueryDto } from '@foodgrid/utils/server';

export class WalletQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['CUSTOMER', 'RIDER'], default: 'CUSTOMER' })
  @IsOptional()
  @IsIn(['CUSTOMER', 'RIDER'])
  as?: 'CUSTOMER' | 'RIDER';
}

export class PayoutRequestDto {
  @ApiProperty({ minimum: 100 }) @IsNumber() @Min(100) @Max(100000) amount!: number;
  @ApiProperty({ enum: ['UPI', 'BANK_TRANSFER'] }) @IsIn(['UPI', 'BANK_TRANSFER']) method!:
    'UPI' | 'BANK_TRANSFER';
  @ApiProperty({ example: { upiId: 'rider@okicici' } }) @IsObject() destination!: Record<
    string,
    string
  >;
}

export class MarkPayoutDto {
  @ApiPropertyOptional({ description: 'Bank UTR reference' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  utr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class CashDepositDto {
  @ApiProperty({ description: 'Cash the rider handed in (₹)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(200000)
  amount!: number;
  @ApiPropertyOptional({ description: 'Hub receipt or bank deposit slip number' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  reference?: string;
}
