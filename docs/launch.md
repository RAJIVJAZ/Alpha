# Launch checklist

Going live on Vercel (web apps) and Railway (API, PostgreSQL, Redis), in order. The
technical steps are detailed in [deployment](./deployment.md#vercel-web-apps--railway-api--alternative-to-aws).

## 1. Start now: accounts that take days

| What                                    | Why                                                                                                                                                                    | Lead time    |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Razorpay account with KYC done          | Online payments. payment-service does not start in production without keys; test keys let you launch with cash on delivery and trial payments, but take no real money. | 2 to 7 days  |
| Google OAuth client (Google Cloud)      | "Continue with Google" on the customer, rider, restaurant and supplier sites. Until SMS codes work, it is the only way new people can sign up.                         | Same day     |
| SMS: DLT registration and MSG91         | Login codes by SMS (the usual login in India). Register the company, sender id and the login template on a DLT portal, then link the template in MSG91.                | 1 to 3 weeks |
| Domain and DNS                          | `foodgrid.in` (or yours) and its subdomains: `admin.`, `partner.`, `supplier.`, `rider.`.                                                                              | Same day     |
| Photo storage (Cloudflare R2 or AWS S3) | Restaurant, dish and product photos uploaded by sellers. Needs a CORS rule for your domains.                                                                           | Same day     |
| Email (AWS SES), optional               | Approval and confirmation emails. Verify the sending domain.                                                                                                           | 1 day        |

## 2. Deploy

1. Merge the open pull request into `claude/dazzling-lamport-apj7w1`, the branch Vercel and
   Railway deploy.
2. Railway: the 12 services and the gateway with their variables, then check every service
   is running and `https://<gateway-domain>/api/v1/delivery/pricing` answers.
3. Run the first-time setup once (the first admin and a city-wide delivery zone):
   `pnpm --filter @foodgrid/database db:setup` (see deployment, Railway step 7). Use a
   database that has never had demo data: if `pnpm db:seed` ever ran against it, start from
   a new database, or customers will see made-up restaurants.
4. Vercel: the customer, admin, restaurant, supplier and rider projects with `API_URL` and
   `GOOGLE_WEB_CLIENT_ID`, then their domains. vendor-web is optional.
5. Disconnect any other deploy hook you do not use (a Cloudflare Workers project connected
   to the repository fails on every push).

## 3. Before opening to the public

1. Sign in to admin-web and add the **Terms** (`terms`) and **Privacy** (`privacy`) pages in
   Content: the customer site links to both. Include the grievance officer's name and
   contact.
2. Check Finance → Delivery pricing shows the launch rules (₹15 below ₹399, free from it;
   riders ₹10 a km, at least ₹33).
3. Bring the first sellers and riders on board:
   - restaurants and food carts sign up at `partner.<domain>`, add their outlet and dishes
     and submit; approve the business and the outlet in Approvals;
   - suppliers, wholesalers and retailers sign up at `supplier.<domain>`;
   - riders apply at `rider.<domain>/apply`; approve them in Riders.
     Outlets must be inside the delivery zone to take delivery orders.
4. Place real test orders: one paid online and one cash on delivery, accept them in the
   restaurant portal, deliver them with a rider, then cancel one before acceptance to see
   the refund.
5. Turn on Railway's PostgreSQL backups and keep the Railway logs bookmarked.

## 4. Business and legal (confirm with your CA or lawyer)

- GST registration (commission and delivery fees are invoiced with GST).
- FSSAI licence for the platform as an e-commerce food business; sellers' FSSAI numbers are
  collected at outlet setup and checked in Approvals.
- Consumer Protection (E-Commerce) Rules, 2020: seller details on listings, a grievance
  officer, and refund and cancellation terms.
- DPDP Act, 2023: the privacy policy and consent for location and contact data.

## Known limits at launch

- Phones use the websites; the Flutter apps need separate Play Store and App Store releases.
- The customer site's default location and area shortcuts are in Bengaluru.
- Demo photos are not used in production; outlets and dishes show photos once sellers
  upload them.
