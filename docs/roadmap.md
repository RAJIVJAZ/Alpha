# Roadmap: the master brief against the code

The FoodGrid master brief (food marketplace and B2B product marketplace, unified seller
portals, rider pay rules, advertising, administration) was checked requirement by
requirement against this repository on 13 October 2026: about 300 requirements in five
areas, each marked present, partial or missing with file references. This page keeps the
outcome: what was already built, what changed in response, and what is left, in the order
we suggest building it.

Sizes: **S** under an hour, **M** about half a day, **L** one to two days, **XL** more.

## Already in place

Most of the brief existed before this round:

- **Ordering.** Customer discovery, menus with variants and add-ons, cart, checkout with
  coupons, memberships and GST, Razorpay and wallet payments, the full order state
  machine with cancellation rules, refunds and failed-payment handling, tracking,
  reviews, reorder and QR table ordering. Restaurants and food carts both sell through
  it, and carts appear in discovery.
- **Food sellers.** Menu management, order board, kitchen display with stations, point of
  sale, daily sales, staff roles, reviews, settlements and payouts, multi-outlet
  businesses, inventory with FEFO batches, recipes and costing, production planning,
  demand forecasts, reorder alerts, supplier comparison and purchase orders, where
  automatic orders need approval unless the business turns on automatic purchasing.
- **Product sellers.** Catalogue with categories, SKU, unit, GST, stock, MOQ and step
  quantity, quantity price tiers (for example ₹52 / ₹49 / ₹46 per kg), delivery zones and
  weekly slots, dealers and territories, B2B orders from placement through dispatch,
  delivery and settlement, seller analytics. The direct-purchase B2B flow is complete,
  and food and B2B carts are separate.
- **Platform.** Tenants with roles and per-permission guards enforced in every service,
  tenant-scoped data access, business, rider and outlet approvals, commission rules (15%
  food, 5% B2B by default), settlements, GST invoices, fraud scoring, analytics, sponsored
  outlet campaigns with budgets and pacing, notifications, the audit log, CI with lint,
  typecheck, unit, integration and Flutter tests.

## Done in this round

| Change                                   | What it covers in the brief                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Delivery pricing and rider pay           | §8 in full: ₹15 below ₹399, free from it; the greater of ₹33 and ₹10 a km; ₹3 one-time waiting pay after 5 minutes with GPS-verified arrival; cancellation pay; versioned, audited admin settings; separate pay lines. See [delivery pricing](./architecture.md#delivery-pricing-and-rider-pay). |
| One Food Seller Portal (restaurant-web)  | §3: restaurants and food carts in one portal, a phone-first cart nav, outlet setup and settings (location, hours, cuisines, ways to order, radius, stations, licences, photos), submit for approval, open / closed, temporary closure, cart location, more branches.                             |
| One Product Seller Portal (supplier-web) | §4: suppliers, wholesalers and retailers in one portal with one nav; vendor-web only points to the two portals.                                                                                                                                                                                  |
| New theme and its review fixes           | §7 look and feel (Olipop-inspired pop look for customers, calm dashboards, a night look for riders), WCAG contrast.                                                                                                                                                                              |
| Search and labels                        | §7: search tolerates typos ("panner", "biriyani") and finds dishes by menu category, exact matches first; paid placements say "Sponsored", also on dishes from sponsored outlets.                                                                                                                |

## What is left

### 1. Seller self-service (mostly UI over existing APIs)

| Gap                                                                                                     | Size |
| ------------------------------------------------------------------------------------------------------- | ---- |
| Carts: quick-add dishes (name, price, veg) with an automatic category; dish creation in merchant-mobile | M    |
| Carts: QR orders recorded as takeaway, so customers get the "ready" notification                        | S    |
| Coupons and promotions screen for sellers (the order-service API exists)                                | M    |
| Sponsored-listing campaigns screen for sellers (the ads-service API exists)                             | L    |
| Business profile after approval (logo, contact, address), and auto-accept for carts                     | M    |
| Notifications inbox on the web; rider assigned / arriving shown on the order board                      | M    |
| Invoices: list and download sales, commission and purchase invoices                                     | M    |
| Customer search on past orders; staff limited to branches from the UI                                   | S    |

### 2. Customer site

| Gap                                                                                      | Size |
| ---------------------------------------------------------------------------------------- | ---- |
| Filters on search results: price, dietary (egg, vegan, Jain, gluten-free), delivery time | M    |
| Favourites                                                                               | M    |
| Location search (geocoding) beyond GPS, saved addresses and the preset areas             | M    |
| Food facts and trivia from a reviewed facts table, with an admin review queue            | L    |
| Help centre and "Get help" on orders, with a support queue                               | L    |

### 3. B2B procurement

| Gap                                                                                                              | Size |
| ---------------------------------------------------------------------------------------------------------------- | ---- |
| Request for quotation: buyer posts a request to chosen sellers, sellers quote, the accepted quote becomes the PO | L    |
| Goods receipt for every B2B order, with rejected or damaged quantity, reason and photo; credit notes             | L    |
| Returns and disputes for B2B orders                                                                              | L    |
| Catalogue: duplicate, draft and archive, CSV / Excel import with per-row errors, exports, several photos, specs  | L    |
| Catalogue: return eligibility, case quantity, more categories (dry fruits and baking, cleaning, packaged foods)  | S    |
| Seller bank or UPI details for settlements; categories sold and serviceable areas in the application             | M    |
| Seller cancels a confirmed order (today only reject while placed)                                                | S    |

### 4. Business types

| Gap                                                                                                                                                      | Size |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Business kinds as labels within today's types: street stall, bakery or café, cloud kitchen; distributor, manufacturer, packaging and ingredient supplier | M    |
| One organization holding several business types (for example a retailer that also wholesales, or a restaurant that also sells products)                  | XL   |

The second needs a decision: today each business has one type, which the token, the
portal and the commission default all read. The suggested shape is a list of approved
types per business, checked by the same guards, with each added type going through
approval like the first.

### 5. Administration

| Gap                                                                                       | Size |
| ----------------------------------------------------------------------------------------- | ---- |
| Orders screen: search, view, intervene, see delivery state, reassign riders               | M    |
| Refunds screen; disputes and support queue                                                | L    |
| Marketplace product moderation; review moderation screen                                  | M    |
| Audit trail screen; audit settlements, payouts, refunds, incentives and coupons too       | M    |
| A compliance reviewer role for KYC; only finance changes incentives and zone surge floors | S    |

### 6. Advertising

The engine (campaigns, auction, pacing, events) exists for outlets and products, but only
sponsored outlet cards are shown. Left: self-serve campaign screens and reporting (L),
serving and labelling sponsored products in the marketplace (L), promoted seller
profiles, banners and category campaigns (M each), frequency caps and click-fraud
protection (M), linking prepayment to campaigns with an ad-spend invoice (L), and
brand accounts for advertisers who do not sell on FoodGrid (M).

### 7. Inventory

Write off expired batches and stop consuming them (M), returns to suppliers and stock put
back when an accepted order is cancelled (M), a period stock statement (opening,
purchases, consumption, wastage, adjustments, returns, closing) (M), deduct on confirmed
production for prepared batches (M), and a recipe test that shows the stock a number of
portions would use (S).

### 8. Platform

A web app manifest so the portals install as apps (M), a maps provider for geocoding and
road distance (M), and a third-party delivery partner option (L).

## Decisions for the owner

- **Several business types per organization** (section 4): confirm the approach before it
  is built.
- **vendor-web**: keep the pointer page at `business.` or delete the Vercel project.
- **Rider pay details** left at the launch values and editable in admin-web: cancellation
  pay ₹0, no cap or extra rate for long distances, batched orders paid separately, waiting
  counted from arrival until pickup or 2 minutes after the food was marked ready, whichever
  is first.
- **Suppliers buying on the marketplace**: today only retailers and wholesalers buy.

The brief prefers a modular monolith. FoodGrid is already twelve services with one schema
per module and events between them, deployed and working, so it stays as it is.
