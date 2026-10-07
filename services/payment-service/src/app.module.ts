import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CoreModule } from '@foodgrid/utils/server';
import { PaymentEventHandlers } from './events/payment-event.handlers';
import { paymentGatewayProvider } from './gateways/gateway.provider';
import { GstService } from './gst/gst.service';
import { InternalController } from './internal/internal.controller';
import { SettlementJobsService } from './jobs/settlement-jobs.service';
import { PayableResolver } from './payments/payable.resolver';
import { AdminPaymentsController, PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { WebhooksService } from './payments/webhooks.service';
import { SERVICE_NAME, SUBSCRIBED_STREAMS } from './service.config';
import {
  AdminFinanceController,
  MerchantFinanceController,
} from './settlements/settlements.controller';
import { SettlementsService } from './settlements/settlements.service';
import { WalletLedgerService } from './wallets/wallet-ledger.service';
import { AdminWalletsController, WalletsController } from './wallets/wallets.controller';
import { WalletsService } from './wallets/wallets.service';

@Module({
  imports: [
    CoreModule.forRoot({ serviceName: SERVICE_NAME, subscribe: SUBSCRIBED_STREAMS }),
    ScheduleModule.forRoot(),
  ],
  controllers: [
    PaymentsController,
    AdminPaymentsController,
    WalletsController,
    AdminWalletsController,
    MerchantFinanceController,
    AdminFinanceController,
    InternalController,
  ],
  providers: [
    paymentGatewayProvider,
    PaymentsService,
    PayableResolver,
    WebhooksService,
    WalletLedgerService,
    WalletsService,
    SettlementsService,
    GstService,
    PaymentEventHandlers,
    SettlementJobsService,
  ],
})
export class AppModule {}
