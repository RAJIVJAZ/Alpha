import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, RequirePermissions, Roles } from '@foodgrid/auth/nest';
import type { PayoutStatus } from '@foodgrid/database';
import type { AccessTokenClaims } from '@foodgrid/types';
import { DirectoryService, IdempotencyInterceptor } from '@foodgrid/utils/server';
import { CashDepositDto, MarkPayoutDto, PayoutRequestDto, WalletQueryDto } from './dto/wallet.dto';
import { WalletLedgerService } from './wallet-ledger.service';
import { WalletsService } from './wallets.service';

@ApiTags('wallets')
@ApiBearerAuth()
@Controller('wallets')
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Wallet balance and statement (customer or rider wallet)' })
  me(@CurrentUser() user: AccessTokenClaims, @Query() q: WalletQueryDto) {
    const as = q.as ?? 'CUSTOMER';
    if (as === 'RIDER' && !user.roles.includes('RIDER'))
      throw new ForbiddenException('Not a rider');
    return this.wallets.statement(as, user.sub, q.page, q.pageSize);
  }

  @Roles('RIDER')
  @Post('me/payouts')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: 'Rider cash-out request (send an Idempotency-Key to make retries safe)',
  })
  payout(@CurrentUser('sub') userId: string, @Body() dto: PayoutRequestDto) {
    return this.wallets.requestPayout(userId, dto);
  }

  @Roles('RIDER')
  @Get('me/payouts')
  payouts(@CurrentUser('sub') userId: string) {
    return this.wallets.payouts(userId);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@RequirePermissions(Permissions.PlatformFinance)
@Controller('admin')
export class AdminWalletsController {
  constructor(
    private readonly wallets: WalletsService,
    private readonly ledger: WalletLedgerService,
    private readonly directory: DirectoryService,
  ) {}

  @Get('payouts')
  async payouts(@Query('status') status?: PayoutStatus, @Query('page') page?: number) {
    const result = await this.wallets.adminPayouts(status, Number(page) || 1);
    const names = await this.directory.lookup(
      'users',
      result.data.map((p) => p.ownerId),
    );
    return {
      ...result,
      data: result.data.map((p) => ({ ...p, ownerName: names.get(p.ownerId)?.name ?? null })),
    };
  }

  @Post('payouts/:id/mark-paid')
  markPaid(@Param('id') id: string, @Body() dto: MarkPayoutDto) {
    return this.wallets.markPaid(id, dto);
  }

  @Post('payouts/:id/mark-failed')
  markFailed(@Param('id') id: string, @Body() dto: MarkPayoutDto) {
    return this.wallets.markFailed(id, dto);
  }

  @Get('rider-cash')
  @ApiOperation({ summary: 'Riders holding more COD cash than they have earned' })
  async riderCash() {
    const rows = await this.wallets.riderCashDue();
    const names = await this.directory.lookup(
      'users',
      rows.map((r) => r.ownerId),
    );
    return rows.map((r) => ({
      ...r,
      riderName: names.get(r.ownerId)?.name ?? null,
      phone: (names.get(r.ownerId)?.phone as string | undefined) ?? null,
    }));
  }

  @Post('rider-cash/:userId/deposits')
  @ApiOperation({ summary: 'Record COD cash a rider handed in' })
  deposit(@Param('userId') userId: string, @Body() dto: CashDepositDto) {
    return this.wallets.recordCashDeposit(userId, dto);
  }

  @Get('wallets/:id/reconcile')
  @ApiOperation({ summary: 'Replay the ledger and compare with the stored balance' })
  reconcile(@Param('id') id: string) {
    return this.ledger.reconcile(id);
  }
}
