import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Permissions } from '@foodgrid/auth';
import { CurrentUser, Public, RequirePermissions } from '@foodgrid/auth/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import { IdempotencyInterceptor } from '@foodgrid/utils/server';
import {
  CreatePaymentIntentDto,
  ListPaymentsDto,
  RefundDto,
  SandboxCompleteDto,
  VerifyPaymentDto,
} from './dto/payment.dto';
import { PaymentsService } from './payments.service';
import { WebhooksService } from './webhooks.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly webhooks: WebhooksService,
  ) {}

  @ApiBearerAuth()
  @Post('intents')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({ summary: 'Start a payment (UPI / card / netbanking via Razorpay, or wallet)' })
  createIntent(
    @CurrentUser() user: AccessTokenClaims,
    @Body() dto: CreatePaymentIntentDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.payments.createIntent(user, dto, key);
  }

  @ApiBearerAuth()
  @Post('verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm Razorpay Checkout success (signature verified server-side)' })
  verify(@CurrentUser() user: AccessTokenClaims, @Body() dto: VerifyPaymentDto) {
    return this.payments.verify(user, dto);
  }

  @ApiBearerAuth()
  @Post('sandbox/:paymentId/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: '[non-production] Simulate checkout success/failure with the sandbox gateway',
  })
  sandbox(
    @CurrentUser() user: AccessTokenClaims,
    @Param('paymentId') paymentId: string,
    @Body() dto: SandboxCompleteDto,
  ) {
    return this.payments.sandboxComplete(user, paymentId, dto.success, dto.method);
  }

  @ApiBearerAuth()
  @Get()
  mine(@CurrentUser('sub') userId: string, @Query() q: ListPaymentsDto) {
    return this.payments.listMine(userId, q);
  }

  @ApiBearerAuth()
  @Get(':id')
  get(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.payments.get(user, id);
  }

  @Public()
  @Post('webhooks/razorpay')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  razorpayWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
    @Headers('x-razorpay-event-id') eventId?: string,
  ) {
    return this.webhooks.handleRazorpay(req.rawBody, signature, eventId);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@RequirePermissions(Permissions.PlatformFinance)
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  list(@Query() q: ListPaymentsDto) {
    return this.payments.listAdmin(q);
  }

  @Post(':id/refunds')
  @ApiOperation({ summary: 'Issue a full or partial refund' })
  refund(@Param('id') id: string, @Body() dto: RefundDto, @CurrentUser('sub') actor: string) {
    return this.payments.refund(id, dto, actor);
  }
}
