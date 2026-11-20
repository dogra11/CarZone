# Synopsis – CarZone: Car Wash, Detailing & Accessories Platform

**Domain:** Web application / E-commerce · **Type:** Final-year project
**Stack:** React 19 · Node.js · Express 4 · MySQL 8

## 1. Problem statement
Car-care businesses in Indian cities take wash bookings over phone/WhatsApp and sell
accessories over the counter. This causes double-booked wash bays, no record of customer
vehicles, manual GST bills, unclear refund rules, accessories that do not fit the customer's
car, stock mismatches and no view of how the business is performing.

## 2. Objectives
1. Online booking of wash and detailing services with live slot availability and
   automatic, transparent GST billing.
2. An accessories store where customers filter by **their car make and model**.
3. Secure online payments (card, UPI, net banking, wallet; COD for store orders) with proper
   server-side verification, refunds and invoices.
4. Reliable inventory: no overselling, full stock ledger, low-stock alerts.
5. One admin panel for operations, catalogue, finance and analytics.

## 3. Scope / modules
| Module | Features |
|---|---|
| Public website | Landing page, services, pricing per vehicle type, offers, FAQ, contact form, map |
| Accounts | Register, login, lockout, password reset, profile, roles (customer/admin) |
| Wash booking | 5-step wizard, add-ons, pickup & drop, live slots, coupons, cancel (refund policy), reschedule, reviews |
| Accessories store | 9 categories, 72 products, make→model compatibility filter, search, sort, wishlist, cart, guest cart merge |
| Checkout & orders | Addresses, coupons, free-shipping threshold, GST-inclusive pricing, fitment at centre, tracking timeline, cancel, return |
| Payments | Gateway abstraction, simulator (OTP, UPI polling, bank page), Razorpay test mode, idempotency, expiry, refunds, receipts |
| Admin | Bookings workflow, slots and capacity, services, add-ons, products & stock, categories, orders workflow, coupons, payments, refunds, reviews moderation, users, messages |
| Analytics & reports | Wash vs store revenue, top services/products, payment success rate, 9 reports with CSV and printable PDF |

## 4. Methodology
Iterative development: requirements → database design (ER, normalisation) → REST API with
Express (feature routers, middleware for auth/roles/validation, central error handling) and a
service layer → React UI → automated API tests → browser end-to-end walkthrough.

## 5. Hardware / software requirements
* PC with 4 GB RAM; Windows 10/11, macOS or Linux
* Node.js 18.18+ (22 LTS recommended), MySQL 8.0 + Workbench, any modern browser, VS Code
* npm packages (installed by `npm install`): `express` 4 and `mysql2`

## 6. Expected outcome
A working platform demonstrating full-stack skills: React SPA, REST API design with Express, relational
database design with transactions and locking, authentication, payment-gateway integration
and reporting.

## 7. Future scope
Mobile app (React Native), SMS/WhatsApp notifications, live Razorpay account, staff app for
wash bays, loyalty points, multi-branch support, delivery partner integration.
