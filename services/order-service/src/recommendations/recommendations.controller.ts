import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsLatitude, IsLongitude, IsOptional, IsString } from 'class-validator';
import { CurrentUser, OptionalUser, Public } from '@foodgrid/auth/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import { ToArray } from '@foodgrid/utils/server';
import { RecommendationsService } from './recommendations.service';

class HomeQuery {
  @ApiProperty() @Type(() => Number) @IsLatitude() lat!: number;
  @ApiProperty() @Type(() => Number) @IsLongitude() lng!: number;
}
class DishQuery {
  @ApiProperty() @IsString() outletId!: string;
  @ApiPropertyOptional({ description: 'Comma separated item ids in the cart' })
  @IsOptional()
  @ToArray()
  @IsArray()
  itemIds?: string[];
}

@ApiTags('recommendations')
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly reco: RecommendationsService) {}

  @Public()
  @Get('home')
  @ApiOperation({ summary: 'AI-ranked home feed: recommended, reorder, top rated, fastest' })
  home(@Query() q: HomeQuery, @OptionalUser() user?: AccessTokenClaims) {
    return this.reco.home(user?.sub, q.lat, q.lng);
  }

  @Get('reorder')
  @ApiOperation({ summary: 'Your usual orders' })
  reorder(@CurrentUser('sub') userId: string) {
    return this.reco.reorderSuggestions(userId);
  }

  @Public()
  @Get('dishes')
  @ApiOperation({ summary: 'Dishes frequently ordered together' })
  dishes(@Query() q: DishQuery) {
    return this.reco.dishes(q.outletId, q.itemIds ?? []);
  }
}
