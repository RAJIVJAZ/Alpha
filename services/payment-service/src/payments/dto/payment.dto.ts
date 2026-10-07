import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PAYMENT_PURPOSES, PaymentPurpose } from '@foodgrid/types';
import { PageQueryDto } from '@foodgrid/utils/server';

export const ONLINE_METHODS = ['UPI', 'CARD', 'NETBANKING', 'WALLET'] as const;

export class CreatePaymentIntentDto {
  @ApiProperty({ enum: PAYMENT_PURPOSES }) @IsIn(PAYMENT_PURPOSES) purpose!: PaymentPurpose;
  @ApiPropertyOptional({
    description:
      'Order / membership / subscription / B2B order / campaign id (not for WALLET_TOPUP)',
  })
  @IsOptional()
  @IsString()
  referenceId?: string;
  @ApiProperty({ enum: ONLINE_METHODS, description: 'WALLET pays from FoodGrid wallet balance' })
  @IsIn(ONLINE_METHODS)
  method!: (typeof ONLINE_METHODS)[number];
  @ApiPropertyOptional({
    description: 'Top-up amount (WALLET_TOPUP only)',
    minimum: 10,
    maximum: 10000,
  })
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(10000)
  amount?: number;
}

export class VerifyPaymentDto {
  @ApiProperty() @IsString() paymentId!: string;
  @ApiProperty() @IsString() razorpayOrderId!: string;
  @ApiProperty() @IsString() razorpayPaymentId!: string;
  @ApiProperty() @IsString() razorpaySignature!: string;
}

export class SandboxCompleteDto {
  @ApiProperty() @IsBoolean() success!: boolean;
  @ApiPropertyOptional({ enum: ['upi', 'card', 'netbanking'] })
  @IsOptional()
  @IsIn(['upi', 'card', 'netbanking'])
  method?: string;
}

export class RefundDto {
  @ApiPropertyOptional({ description: 'Defaults to the full refundable amount' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  amount?: number;
  @ApiProperty() @IsString() @MaxLength(300) reason!: string;
  @ApiPropertyOptional({ description: 'Refund instantly to the FoodGrid wallet' })
  @IsOptional()
  @IsBoolean()
  toWallet?: boolean;
}

export class ListPaymentsDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: PAYMENT_PURPOSES })
  @IsOptional()
  @IsIn(PAYMENT_PURPOSES)
  purpose?: PaymentPurpose;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() state?: string;
}
