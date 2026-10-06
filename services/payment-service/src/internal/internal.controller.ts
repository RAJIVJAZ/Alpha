import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Internal } from '@foodgrid/auth/nest';
import { PrismaService } from '@foodgrid/database/nest';
import type { LedgerReason } from '@foodgrid/database';
import { notFound } from '@foodgrid/utils';
import { WalletLedgerService } from '../wallets/wallet-ledger.service';

class InternalCreditDto {
  @ApiProperty({ enum: ['CUSTOMER', 'RIDER', 'TENANT'] }) @IsIn(['CUSTOMER', 'RIDER', 'TENANT']) ownerType!: 'CUSTOMER' | 'RIDER' | 'TENANT';
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

@ApiTags('internal')
@Internal()
@Controller('internal/payments')
export class InternalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: WalletLedgerService,
  ) {}

  @Get(':id')
  async payment(@Param('id') id: string) {
    const p = await this.prisma.payment.findUnique({ where: { id }, include: { refunds: true } });
    if (!p) throw notFound('Payment', id);
    return p;
  }

  @Post('wallets/credit')
  credit(@Body() dto: InternalCreditDto) {
    return this.ledger.credit(dto);
  }
}
