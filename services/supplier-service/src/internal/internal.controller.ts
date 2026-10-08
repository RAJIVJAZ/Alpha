import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Internal } from '@foodgrid/auth/nest';
import { PrismaService } from '@foodgrid/database/nest';
import { STOCK_UNITS } from '@foodgrid/types';
import { notFound, Unit } from '@foodgrid/utils';
import { catalogueUnitPrice } from '../domain/b2b-pricing';
import { B2bOrdersService } from '../orders/b2b-orders.service';
import { QuotesService } from '../quotes/quotes.service';

class QuoteRequestDto {
  @ApiProperty() @IsString() buyerTenantId!: string;
  @ApiProperty({ example: 'FLOUR' }) @IsString() category!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() searchTerm?: string;
  @ApiProperty({ enum: STOCK_UNITS }) @IsIn(STOCK_UNITS) unit!: Unit;
  @ApiProperty() @IsNumber() @Min(0.001) quantity!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() pincode?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() lng?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() productIds?: string[];
}

@ApiTags('internal')
@Internal()
@Controller('internal/marketplace')
export class InternalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotes: QuotesService,
    private readonly orders: B2bOrdersService,
  ) {}

  @Post('quotes')
  @HttpCode(200)
  @ApiOperation({ summary: 'Comparable supplier offers for an ingredient (procurement engine)' })
  quote(@Body() dto: QuoteRequestDto) {
    return this.quotes.quotes(dto);
  }

  @Get('orders/:id')
  async order(@Param('id') id: string) {
    const order = await this.prisma.b2bOrder.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw notFound('B2B order', id);
    return order;
  }

  @Get('orders/:id/payable')
  async payable(@Param('id') id: string) {
    const order = await this.prisma.b2bOrder.findUnique({ where: { id } });
    if (!order) throw notFound('B2B order', id);
    return {
      referenceId: id,
      amount: order.total.toString(),
      userId: null,
      tenantId: order.buyerTenantId,
      payable:
        order.paymentStatus === 'PENDING' &&
        [
          'CONFIRMED',
          'PARTIALLY_CONFIRMED',
          'PACKED',
          'DISPATCHED',
          'IN_TRANSIT',
          'DELIVERED',
        ].includes(order.status),
      description: `${order.orderNumber} — ${order.sellerName}`,
    };
  }

  /**
   * With buyerTenantId + quantity, `buyerUnitPrice` is the catalogue price that
   * buyer would be billed (segment, validity and quantity rules; before any
   * dealer discount), so purchase orders never re-implement tier selection.
   */
  @Get('products/:id')
  async product(
    @Param('id') id: string,
    @Query('buyerTenantId') buyerTenantId?: string,
    @Query('quantity') quantity?: string,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { priceTiers: true },
    });
    if (!product) throw notFound('Product', id);
    if (!buyerTenantId || !Number(quantity)) return product;
    const { segment } = await this.orders.buyerTerms(product.tenantId, buyerTenantId);
    return { ...product, buyerUnitPrice: catalogueUnitPrice(product, Number(quantity), segment) };
  }
}
