import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MEAL_SLOTS, MealSlot } from '@foodgrid/types';
import { AddressSnapshotDto } from '../../orders/dto/order.dto';

export class SubscriptionPlanDto {
  @ApiProperty() @IsString() outletId!: string;
  @ApiProperty({ example: 'Weekday Veg Thali (Lunch)' }) @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiProperty({ enum: MEAL_SLOTS }) @IsIn(MEAL_SLOTS) slot!: MealSlot;
  @ApiProperty({ example: 30 }) @IsInt() @Min(5) @Max(180) durationDays!: number;
  @ApiProperty({ example: [1, 2, 3, 4, 5], description: 'ISO weekdays served' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  daysOfWeek!: number[];
  @ApiProperty({ example: 120 }) @IsNumber() @Min(1) pricePerMeal!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isVeg?: boolean;
  @ApiProperty({ description: '{ "1": ["menuItemId"], ... } menu per ISO weekday' })
  @IsObject()
  menuRotation!: Record<string, string[]>;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateSubscriptionPlanDto extends PartialType(SubscriptionPlanDto) {}

export class SubscribeDto {
  @ApiProperty() @IsString() planId!: string;
  @ApiProperty({ example: '2026-10-12' }) @IsDateString() startDate!: string;
  @ApiProperty({ example: '12:30' }) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) deliveryTime!: string;
  @ApiProperty({ type: AddressSnapshotDto })
  @ValidateNested()
  @Type(() => AddressSnapshotDto)
  deliveryAddress!: AddressSnapshotDto;
}

export class PauseDto {
  @ApiProperty({ type: [String], example: ['2026-10-20'] })
  @IsArray()
  @ArrayMaxSize(60)
  @IsDateString({}, { each: true })
  dates!: string[];
}
