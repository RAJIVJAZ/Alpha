import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Public } from '@foodgrid/auth/nest';
import { OUTLET_TYPES, OutletType } from '@foodgrid/types';
import { SearchService } from './search.service';

export class SearchQueryDto {
  @ApiProperty({ example: 'biryani' }) @IsString() @MinLength(2) @MaxLength(80) q!: string;
  @ApiProperty() @Type(() => Number) @IsLatitude() lat!: number;
  @ApiProperty() @Type(() => Number) @IsLongitude() lng!: number;
  @ApiPropertyOptional({ enum: OUTLET_TYPES }) @IsOptional() @IsIn(OUTLET_TYPES) type?: OutletType;
}

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Search restaurants, food carts and dishes near a location' })
  find(@Query() q: SearchQueryDto) {
    return this.search.search(q);
  }

  @Public()
  @Get('suggest')
  @ApiOperation({ summary: 'Autocomplete suggestions (cuisines, outlets, dishes)' })
  suggest(@Query() q: SearchQueryDto) {
    return this.search.suggest(q);
  }
}
