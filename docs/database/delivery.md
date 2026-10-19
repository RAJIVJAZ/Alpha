# `delivery` schema

Owner: delivery-service · 11 models · [all contexts](./README.md)

The diagram shows keys and relations; every column is listed in the reference below.

```mermaid
erDiagram
  Delivery {
    String id PK
    String orderId UK "-> commerce.Order"
    String tenantId "-> identity.Tenant"
    String outletId "-> commerce.Outlet"
    String customerId "-> identity.User"
    String riderId FK
    String zoneId FK
    String pricingPolicyId FK
  }
  DeliveryOffer {
    String id PK
    String deliveryId FK
    String riderId FK
  }
  DeliveryPricingPolicy {
    String id PK
    Int version UK
  }
  DeliveryWait {
    String id PK
    String deliveryId FK
    String riderId "-> delivery.RiderProfile"
    String policyId FK
  }
  DeliveryZone {
    String id PK
  }
  IncentiveScheme {
    String id PK
    String zoneId FK
  }
  RiderAttendance {
    String id PK
    String riderId FK
  }
  RiderEarning {
    String id PK
    String riderId FK
    String deliveryId "-> delivery.Delivery"
  }
  RiderIncentive {
    String id PK
    String riderId FK
    String schemeId FK
  }
  RiderLocationPing {
    String id PK
    String riderId "-> delivery.RiderProfile"
    String deliveryId "-> delivery.Delivery"
  }
  RiderProfile {
    String id PK
    String userId UK "-> identity.User"
    String zoneId FK
  }
  Delivery ||--o{ DeliveryOffer : "delivery"
  Delivery ||--o{ DeliveryWait : "delivery"
  DeliveryPricingPolicy |o--o{ Delivery : "pricingPolicy"
  DeliveryPricingPolicy ||--o{ DeliveryWait : "policy"
  DeliveryZone |o--o{ Delivery : "zone"
  DeliveryZone |o--o{ IncentiveScheme : "zone"
  DeliveryZone |o--o{ RiderProfile : "zone"
  IncentiveScheme ||--o{ RiderIncentive : "scheme"
  RiderProfile |o--o{ Delivery : "rider"
  RiderProfile ||--o{ DeliveryOffer : "rider"
  RiderProfile ||--o{ RiderAttendance : "rider"
  RiderProfile ||--o{ RiderEarning : "rider"
  RiderProfile ||--o{ RiderIncentive : "rider"
```

## Delivery

Table `delivery."Delivery"`

| Column | Type | Null | Default | Notes |
| --- | --- | :---: | --- | --- |
| `id` | String |  | cuid() | PK |
| `orderId` | String |  |  | unique; → commerce.Order |
| `orderNumber` | String |  |  |  |
| `tenantId` | String |  |  | → identity.Tenant |
| `outletId` | String |  |  | → commerce.Outlet |
| `customerId` | String | ✓ |  | → identity.User |
| `riderId` | String | ✓ |  |  |
| `zoneId` | String | ✓ |  |  |
| `status` | enum DeliveryStatus |  | UNASSIGNED |  |
| `pickupName` | String |  |  |  |
| `pickupAddress` | String |  |  |  |
| `pickupLat` | Float |  |  |  |
| `pickupLng` | Float |  |  |  |
| `pickupPhone` | String | ✓ |  |  |
| `dropName` | String | ✓ |  |  |
| `dropAddress` | String |  |  |  |
| `dropLat` | Float |  |  |  |
| `dropLng` | Float |  |  |  |
| `dropPhone` | String | ✓ |  |  |
| `distanceKm` | Float |  |  |  |
| `estimatedMins` | Int |  |  |  |
| `orderValue` | Decimal |  |  |  |
| `isCod` | Boolean |  | false |  |
| `codAmount` | Decimal |  | 0 |  |
| `tipAmount` | Decimal |  | 0 |  |
| `riderEarning` | Decimal |  | 0 | The quoted pay while the delivery runs; once it ends, what the rider was paid (tip excluded). |
| `surgeMultiplier` | Float |  | 1 |  |
| `pricingPolicyId` | String | ✓ |  | Pricing version the rider pay follows; null for deliveries created before versions. |
| `payableKm` | Float | ✓ |  | Distance the rider is paid for (distanceKm to 0.1 km). |
| `deliveryOtp` | String | ✓ |  |  |
| `proofPhotoUrl` | String | ✓ |  |  |
| `proofSignatureUrl` | String | ✓ |  |  |
| `proofNote` | String | ✓ |  |  |
| `failureReason` | String | ✓ |  |  |
| `route` | Json | ✓ |  | Optimised route: ordered stops + polyline. |
| `batchId` | String | ✓ |  |  |
| `searchAttempts` | Int |  | 0 |  |
| `readyAt` | DateTime | ✓ |  | The kitchen's estimate until the order is marked ready, then when it was. |
| `orderReadyAt` | DateTime | ✓ |  | When the restaurant marked the order ready (null until it does). |
| `assignedAt` | DateTime | ✓ |  |  |
| `arrivedPickupAt` | DateTime | ✓ |  |  |
| `pickedUpAt` | DateTime | ✓ |  |  |
| `arrivedDropAt` | DateTime | ✓ |  |  |
| `deliveredAt` | DateTime | ✓ |  |  |
| `cancelledAt` | DateTime | ✓ |  |  |
| `createdAt` | DateTime |  | now() |  |
| `updatedAt` | DateTime |  |  |  |

## DeliveryOffer

Table `delivery."DeliveryOffer"`

| Column | Type | Null | Default | Notes |
| --- | --- | :---: | --- | --- |
| `id` | String |  | cuid() | PK |
| `deliveryId` | String |  |  |  |
| `riderId` | String |  |  |  |
| `status` | enum OfferStatus |  | PENDING |  |
| `score` | Float |  |  |  |
| `distanceToPickupKm` | Float |  |  |  |
| `estimatedEarning` | Decimal |  |  |  |
| `offeredAt` | DateTime |  | now() |  |
| `expiresAt` | DateTime |  |  |  |
| `respondedAt` | DateTime | ✓ |  |  |
| `rejectReason` | String | ✓ |  |  |

## DeliveryPricingPolicy

Delivery pricing: the customer delivery fee and the rider pay. Rows are never edited: a
change adds the next version, and each delivery keeps the version it was priced with.

Table `delivery."DeliveryPricingPolicy"`

| Column | Type | Null | Default | Notes |
| --- | --- | :---: | --- | --- |
| `id` | String |  | cuid() | PK |
| `version` | Int |  |  | unique |
| `customerFlatFee` | Decimal |  |  | Charged when the food subtotal is below freeDeliveryAbove. |
| `freeDeliveryAbove` | Decimal | ✓ |  | Food subtotal from which delivery is free; null means never free. |
| `riderPerKm` | Decimal |  |  |  |
| `riderMinPayout` | Decimal |  |  | A delivered order pays at least this (the greater of it and riderPerKm x payable km). |
| `waitingThresholdMins` | Int |  |  |  |
| `waitingPay` | Decimal |  |  | Paid once per delivery for a verified wait longer than the threshold. |
| `arrivalRadiusM` | Int |  |  | An arrival counts for waiting pay only within this distance of the pickup. |
| `cancellationPay` | Decimal |  |  | Paid when a delivery is cancelled or fails after the rider reached the pickup. |
| `note` | String | ✓ |  | Why it changed, shown in the history. |
| `createdBy` | String |  |  | User who made this version; "system" for the launch defaults. |
| `createdAt` | DateTime |  | now() |  |

## DeliveryWait

Waiting at the pickup: opened when the rider marks arrival, closed at pickup, when the
delivery ends or when ops hand it to another rider. One per delivery and rider (unique),
so a wait is paid at most once.

Table `delivery."DeliveryWait"`

| Column | Type | Null | Default | Notes |
| --- | --- | :---: | --- | --- |
| `id` | String |  | cuid() | PK |
| `deliveryId` | String |  |  |  |
| `riderId` | String |  |  | → delivery.RiderProfile |
| `policyId` | String |  |  |  |
| `arrivedAt` | DateTime |  |  |  |
| `arrivalLat` | Float | ✓ |  | The rider's last GPS fix when marking arrival; null without a recent fix. |
| `arrivalLng` | Float | ✓ |  |  |
| `arrivalDistanceM` | Int | ✓ |  |  |
| `verified` | Boolean |  |  | The fix was recent and inside the policy's arrival radius. |
| `orderReadyAt` | DateTime | ✓ |  | When the restaurant marked the order ready, if it had by the end of the wait. |
| `endedAt` | DateTime | ✓ |  |  |
| `endedBy` | enum DeliveryStatus | ✓ |  | PICKED_UP, CANCELLED or FAILED; SEARCHING when ops reassigned the delivery |
| `waitedMins` | Float | ✓ |  |  |
| `thresholdMins` | Int |  |  |  |
| `amount` | Decimal |  | 0 |  |
| `createdAt` | DateTime |  | now() |  |

Constraints: unique (deliveryId, riderId)

## DeliveryZone

Table `delivery."DeliveryZone"`

| Column | Type | Null | Default | Notes |
| --- | --- | :---: | --- | --- |
| `id` | String |  | cuid() | PK |
| `name` | String |  |  |  |
| `city` | String |  |  |  |
| `polygon` | Json |  |  | GeoJSON Polygon coordinates: [[[lng, lat], ...]] |
| `centerLat` | Float |  |  |  |
| `centerLng` | Float |  |  |  |
| `baseFee` | Decimal |  | 25 | The five tariff columns below are unused since delivery pricing versions (DeliveryPricingPolicy); they stay, with defaults, for the release that still reads them, and can be dropped in the next one. |
| `perKmFee` | Decimal |  | 8 |  |
| `freeKm` | Float |  | 2 |  |
| `riderBasePay` | Decimal |  | 30 |  |
| `riderPerKm` | Decimal |  | 6 |  |
| `surgeMultiplier` | Float |  | 1 | Floor for the live surge; surge raises rider pay, not the customer's delivery fee. |
| `isActive` | Boolean |  | true |  |
| `createdAt` | DateTime |  | now() |  |
| `updatedAt` | DateTime |  |  |  |

## IncentiveScheme

Table `delivery."IncentiveScheme"`

| Column | Type | Null | Default | Notes |
| --- | --- | :---: | --- | --- |
| `id` | String |  | cuid() | PK |
| `name` | String |  |  |  |
| `description` | String | ✓ |  |  |
| `type` | enum IncentiveType |  |  |  |
| `zoneId` | String | ✓ |  |  |
| `city` | String | ✓ |  |  |
| `target` | Int |  |  |  |
| `rewardAmount` | Decimal |  |  |  |
| `peakWindows` | Json | ✓ |  | [{ "start": "12:00", "end": "14:30" }] for PEAK_HOURS schemes. |
| `minRating` | Float | ✓ |  |  |
| `startsAt` | DateTime |  |  |  |
| `endsAt` | DateTime |  |  |  |
| `isActive` | Boolean |  | true |  |
| `createdAt` | DateTime |  | now() |  |
| `updatedAt` | DateTime |  |  |  |

## RiderAttendance

Table `delivery."RiderAttendance"`

| Column | Type | Null | Default | Notes |
| --- | --- | :---: | --- | --- |
| `id` | String |  | cuid() | PK |
| `riderId` | String |  |  |  |
| `date` | DateTime |  |  |  |
| `status` | enum AttendanceStatus |  | PRESENT |  |
| `checkInAt` | DateTime | ✓ |  |  |
| `checkOutAt` | DateTime | ✓ |  |  |
| `checkInLat` | Float | ✓ |  |  |
| `checkInLng` | Float | ✓ |  |  |
| `onlineMinutes` | Int |  | 0 |  |
| `deliveryCount` | Int |  | 0 |  |
| `distanceKm` | Float |  | 0 |  |
| `createdAt` | DateTime |  | now() |  |
| `updatedAt` | DateTime |  |  |  |

Constraints: unique (riderId, date)

## RiderEarning

Table `delivery."RiderEarning"`

| Column | Type | Null | Default | Notes |
| --- | --- | :---: | --- | --- |
| `id` | String |  | cuid() | PK |
| `riderId` | String |  |  |  |
| `deliveryId` | String | ✓ |  | → delivery.Delivery |
| `type` | enum EarningType |  |  |  |
| `amount` | Decimal |  |  |  |
| `description` | String | ✓ |  |  |
| `earnedAt` | DateTime |  | now() |  |
| `settledAt` | DateTime | ✓ |  |  |
| `walletTxnId` | String | ✓ |  |  |

## RiderIncentive

Table `delivery."RiderIncentive"`

| Column | Type | Null | Default | Notes |
| --- | --- | :---: | --- | --- |
| `id` | String |  | cuid() | PK |
| `riderId` | String |  |  |  |
| `schemeId` | String |  |  |  |
| `progress` | Int |  | 0 |  |
| `target` | Int |  |  |  |
| `rewardAmount` | Decimal |  |  |  |
| `status` | enum IncentiveProgressStatus |  | IN_PROGRESS |  |
| `achievedAt` | DateTime | ✓ |  |  |
| `paidAt` | DateTime | ✓ |  |  |
| `createdAt` | DateTime |  | now() |  |
| `updatedAt` | DateTime |  |  |  |

Constraints: unique (riderId, schemeId)

## RiderLocationPing

Sampled GPS trail. Hot "current position" lives in Redis GEO; this table
keeps history for disputes, fraud checks and heat maps.

Table `delivery."RiderLocationPing"`

| Column | Type | Null | Default | Notes |
| --- | --- | :---: | --- | --- |
| `id` | String |  | cuid() | PK |
| `riderId` | String |  |  | → delivery.RiderProfile |
| `deliveryId` | String | ✓ |  | → delivery.Delivery |
| `lat` | Float |  |  |  |
| `lng` | Float |  |  |  |
| `accuracyM` | Float | ✓ |  |  |
| `speedKmph` | Float | ✓ |  |  |
| `heading` | Float | ✓ |  |  |
| `batteryPct` | Int | ✓ |  |  |
| `recordedAt` | DateTime |  | now() |  |

## RiderProfile

Table `delivery."RiderProfile"`

| Column | Type | Null | Default | Notes |
| --- | --- | :---: | --- | --- |
| `id` | String |  | cuid() | PK |
| `userId` | String |  |  | unique; → identity.User |
| `status` | enum RiderStatus |  | PENDING_APPROVAL |  |
| `name` | String |  |  |  |
| `phone` | String |  |  |  |
| `city` | String |  |  |  |
| `zoneId` | String | ✓ |  |  |
| `vehicleType` | enum VehicleType |  | MOTORCYCLE |  |
| `vehicleNumber` | String | ✓ |  |  |
| `licenseNumber` | String | ✓ |  |  |
| `aadhaarLast4` | String | ✓ |  |  |
| `documents` | Json |  | [] |  |
| `rating` | Float |  | 5 |  |
| `ratingCount` | Int |  | 0 |  |
| `isOnline` | Boolean |  | false |  |
| `isOnDelivery` | Boolean |  | false |  |
| `currentLat` | Float | ✓ |  |  |
| `currentLng` | Float | ✓ |  |  |
| `lastLocationAt` | DateTime | ✓ |  |  |
| `acceptanceRate` | Float |  | 1 |  |
| `totalDeliveries` | Int |  | 0 |  |
| `bankAccount` | Json | ✓ |  |  |
| `upiId` | String | ✓ |  |  |
| `approvedAt` | DateTime | ✓ |  |  |
| `approvedBy` | String | ✓ |  |  |
| `rejectionReason` | String | ✓ |  | Reviewer's note when the application was rejected or changes were requested; cleared on resubmission. |
| `createdAt` | DateTime |  | now() |  |
| `updatedAt` | DateTime |  |  |  |
