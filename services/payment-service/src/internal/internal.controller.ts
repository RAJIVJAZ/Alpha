import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Internal } from '@foodgrid/auth/nest';
import { PrismaService } from '@foodgrid/database/nest';
import type { LedgerReason } from '@foodgrid/database';
import { AppError, notFound } from '@foodgrid/utils';
import { PaymentsService } from '../payments/payments.service';
import { WalletLedgerService } from '../wallets/wallet-ledger.service';

class InternalCreditDto {
  @ApiProperty({ enum: ['CUSTOMER', 'RIDER', 'TENANT'] })
  @IsIn(['CUSTOMER', 'RIDER', 'TENANT'])
  ownerType!: 'CUSTOMER' | 'RIDER' | 'TENANT';
  @ApiProperty() @IsString() ownerId!: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount!: number;
  @ApiProperty({ enum: ['CASHBACK', 'REFERRAL_BONUS', 'ADJUSTMENT', 'INCENTIVE'] })
  @IsIn(['CASHBACK', 'REFERRAL_BONUS', 'ADJUSTMENT', 'INCENTIVE'])
  reason!: LedgerReason;
  @ApiProperty() @IsString() idempotencyKey!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceId?: string;
}

class InternalRefundDto {
  @ApiProperty() @IsString() reason!: string;
}

@ApiTags('internal')
@Internal()
@Controller('internal/payments')
export class InternalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: WalletLedgerService,
    private readonly payments: PaymentsService,
  ) {}

  @Get(':id')
  async payment(@Param('id') id: string) {
    const p = await this.prisma.payment.findUnique({ where: { id }, include: { refunds: true } });
    if (!p) throw notFound('Payment', id);
    return p;
  }

  /**
   * Full refund of a payment nothing needs any more (a second payment for an order already
   * paid, a capture for a membership or subscription no longer awaiting payment). Safe to
   * repeat: a payment already refunded, or with its refund in flight, is left alone.
   */
  @Post(':id/refund')
  @HttpCode(200)
  async refund(@Param('id') id: string, @Body() dto: InternalRefundDto) {
    try {
      await this.payments.refund(id, { reason: dto.reason }, 'system');
      return { refunded: true };
    } catch (err) {
      if (err instanceof AppError && ['REFUND_EXCEEDS', 'NOT_REFUNDABLE'].includes(err.code))
        return { refunded: false };
      throw err;
    }
  }

  @Post('wallets/credit')
  credit(@Body() dto: InternalCreditDto) {
    return this.ledger.credit(dto);
  }
}
