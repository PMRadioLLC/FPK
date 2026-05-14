# Fun Pizza Kitchen — API Reference

Base URL: `http://localhost:3000/api`

All protected endpoints require: `Authorization: Bearer <JWT_TOKEN>`

---

## Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/login` | None | Login with Firebase token → returns JWT |
| POST | `/auth/register` | None | Register new account (checks age ≥ 21) → returns JWT |

---

## Users

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/users/me` | Member+ | Get your own profile |
| PUT | `/users/me/selfie` | Member+ | Update selfie URL |
| GET | `/users` | Manager/Owner | List all members (paginated) |
| GET | `/users/search?q=` | Manager/Owner | Search users by name/email |
| PUT | `/users/:id/ban` | Manager/Owner | Ban a user |
| PUT | `/users/:id/unban` | Manager/Owner | Unban a user |

---

## ID Verification

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/verifications/me` | Member+ | Check my verification status |
| GET | `/verifications/pending` | Staff+ | Get pending verification queue |
| POST | `/verifications/:id/approve` | Staff+ | Approve a user's ID |
| POST | `/verifications/:id/reject` | Staff+ | Reject a user's ID |

---

## Memberships

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/memberships/plans` | None | Get available plans with pricing |
| GET | `/memberships/me` | Member+ | Get my active membership |
| GET | `/memberships/me/history` | Member+ | Get my membership history |
| PUT | `/memberships/me/cancel-renewal` | Member+ | Cancel auto-renewal |
| POST | `/memberships/validate-promo` | Member+ | Validate a promo code |
| PUT | `/memberships/:id/revoke` | Manager/Owner | Revoke a membership |

---

## Barcode

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/barcode` | Member+ | Get current rotating barcode (call every 30s) |
| POST | `/barcode/scan` | Staff+ | Scan & validate a member's barcode |

---

## Payments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/payments/card` | Member+ | Create Stripe PaymentIntent |
| POST | `/payments/cash` | Member+ | Request cash payment (pending) |
| GET | `/payments/cash/pending` | Staff+ | View pending cash payments |
| PUT | `/payments/cash/:id/confirm` | Staff+ | Confirm cash received |
| POST | `/payments/webhook` | None (Stripe sig) | Stripe webhook handler |
| GET | `/payments/promo-codes` | Manager/Owner | List all promo codes |
| POST | `/payments/promo-codes` | Manager/Owner | Create promo code |

---

## Drinks

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/drinks/menu` | Member+ | Get all menu items |
| POST | `/drinks/menu` | Manager/Owner | Add menu item |
| PUT | `/drinks/menu/:id` | Manager/Owner | Update menu item |
| GET | `/drinks/location/:locId` | Member+ | Get drinks at a location |
| PUT | `/drinks/location/:locId/:drinkId` | Manager/Owner | Toggle availability |
| GET | `/drinks/logs/me` | Member+ | My drink history |
| GET | `/drinks/logs/location/:locId` | Manager/Owner | Location drink logs |
| GET | `/drinks/limits/:locId` | Manager/Owner | Get limit config |
| PUT | `/drinks/limits/:locId` | Manager/Owner | Update limit config |

---

## Locations

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/locations` | Member+ | List all active locations |
| GET | `/locations/:id` | Member+ | Get location details |
| POST | `/locations` | Owner | Create a location |
| PUT | `/locations/:id` | Owner | Update a location |
| GET | `/locations/:id/staff` | Manager/Owner | Get staff at location |
| POST | `/locations/:id/staff` | Manager/Owner | Assign staff |
| DELETE | `/locations/:id/staff/:assignId` | Manager/Owner | Remove staff assignment |
| GET | `/locations/my/assignments` | Staff+ | Get my assigned locations |

---

## Role Hierarchy

- **Owner** — Full access to everything across all locations
- **Manager** — Can manage a specific location, approve IDs, manage menu
- **Staff** — Can scan barcodes and confirm cash payments only
- **Member** — Can view their profile, barcode, and drink history
