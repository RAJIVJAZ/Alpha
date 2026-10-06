import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Internal } from '@foodgrid/auth/nest';
import { PrismaService } from '@foodgrid/database/nest';
import { estimateRoadKm, notFound, travelMinutes } from '@foodgrid/utils';
import { GeoStore } from '../common/geo-store';
import { ZonesService } from '../zones/zones.service';

@ApiTags('internal')
@Internal()
@Controller('internal')
export class InternalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly zones: ZonesService,
    private readonly geo: GeoStore,
  ) {}

  @Get('delivery/quote')
  @ApiOperation({ summary: 'Serviceability, distance, fee (with surge) and ETA for checkout' })
  quote(
    @Query('pickupLat') pickupLat: string,
    @Query('pickupLng') pickupLng: string,
    @Query('dropLat') dropLat: string,
    @Query('dropLng') dropLng: string,
    @Query('prepMins') prepMins?: string,
  ) {
    return this.zones.quote({ lat: Number(pickupLat), lng: Number(pickupLng) }, { lat: Number(dropLat), lng: Number(dropLng) }, Number(prepMins) || 20);
  }

  @Get('riders/by-user/:userId')
  async riderByUser(@Param('userId') userId: string) {
    const rider = await this.prisma.riderProfile.findUnique({ where: { userId }, select: { id: true, name: true, city: true, status: true } });
    if (!rider) throw notFound('Rider profile');
    return rider;
  }

  @Get('deliveries/by-order/:orderId')
  @ApiOperation({ summary: 'Tracking snapshot for order-service' })
  async byOrder(@Param('orderId') orderId: string) {
    const d = await this.prisma.delivery.findUnique({ where: { orderId }, include: { rider: true } });
    if (!d) throw notFound('Delivery for order', orderId);
    const pos = d.riderId ? await this.geo.last(d.riderId) : null;
    let etaMins: number | null = null;
    if (pos) {
      const toPickup = ['ASSIGNED', 'AT_PICKUP'].includes(d.status) ? travelMinutes(estimateRoadKm(pos, { lat: d.pickupLat, lng: d.pickupLng })) : 0;
      const trip = travelMinutes(estimateRoadKm(['ASSIGNED', 'AT_PICKUP'].includes(d.status) ? { lat: d.pickupLat, lng: d.pickupLng } : pos, { lat: d.dropLat, lng: d.dropLng }));
      etaMins = toPickup + trip + (['ASSIGNED', 'AT_PICKUP'].includes(d.status) ? 5 : 0);
    }
    return {
      deliveryId: d.id,
      status: d.status,
      etaMins,
      rider: d.rider
        ? { id: d.rider.id, name: d.rider.name, phone: d.rider.phone, vehicleNumber: d.rider.vehicleNumber, rating: d.rider.rating, lat: pos?.lat ?? d.rider.currentLat, lng: pos?.lng ?? d.rider.currentLng }
        : null,
    };
  }
}
