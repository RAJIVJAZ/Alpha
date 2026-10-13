import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/** A new pricing version: every value is restated, so a version reads on its own. */
export class DeliveryPricingDto {
  @ApiProperty({
    example: 15,
    description: 'Charged when the food subtotal is below the threshold',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(500)
  customerFlatFee!: number;

  @ApiProperty({
    example: 399,
    nullable: true,
    description: 'Food subtotal from which delivery is free; null means never free',
  })
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000)
  freeDeliveryAbove!: number | null;

  @ApiProperty({ example: 10 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(200)
  riderPerKm!: number;

  @ApiProperty({ example: 33, description: 'A delivered order pays at least this' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  riderMinPayout!: number;

  @ApiProperty({ example: 5 }) @IsInt() @Min(1) @Max(60) waitingThresholdMins!: number;

  @ApiProperty({ example: 3, description: 'Paid once per delivery for a longer verified wait' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(500)
  waitingPay!: number;

  @ApiProperty({
    example: 200,
    description: 'Arrival must be within this many metres of the pickup',
  })
  @IsInt()
  @Min(50)
  @Max(1000)
  arrivalRadiusM!: number;

  @ApiProperty({
    example: 0,
    description: 'Paid when a delivery is cancelled or fails after the rider reached the pickup',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  cancellationPay!: number;

  @ApiProperty({ example: 'Festival week: minimum payout up to ₹40', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
