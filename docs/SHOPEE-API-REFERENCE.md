# Shopee Open Platform API v2 — Reference for Profit Dashboard

**Generated from:** Uploaded JSON indexes + codebase analysis + known API specs
**Last Updated:** 2026-04-11

---

## Available API Modules

| Module | File | Endpoints | Relevance |
|--------|------|-----------|-----------|
| Order | order.json | 10 endpoints | **CRITICAL** — sync orders |
| Payment | payment.json | 14 endpoints | **CRITICAL** — escrow, fees |
| Product | product.json | 30+ endpoints | **HIGH** — COGS mapping |
| AMS (Ads) | ams.json | 29 endpoints | **MEDIUM** — ad spend tracking |
| Discount | discount.json | 7 endpoints | LOW — promo tracking |
| Bundle Deal | bundle_deal.json | 7 endpoints | LOW — bundle promo |
| Add-on Deal | add_on_deal.json | 10 endpoints | LOW — add-on promo |
| Shop | shop.json | shop info | Used for status check |
| Logistics | logistics.json | shipping | Future — shipping tracking |
| First Mile | first_mile.json | pickup | Future |
| Merchant | merchant.json | merchant info | Future |
| Media Space | media_space.json | media upload | Not needed |
| Global Product | global_product.json | cross-border | Not needed (ID only) |

---

## 1. ORDER MODULE — Endpoints We Use

### `get_order_list` ⭐ ACTIVE
- **Path:** `/api/v2/order/get_order_list`
- **Method:** GET
- **Rate Limit:** ~20 calls/second per shop

**Request Params:**
| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `time_range_field` | string | Yes | `create_time` or `update_time` only. **NOT `pay_time`** |
| `time_from` | int (unix) | Yes | Start of range |
| `time_to` | int (unix) | Yes | End of range. Max span: **15 days** |
| `page_size` | int | Yes | Max **100** |
| `cursor` | string | No | For pagination |
| `order_status` | string | No | Filter: UNPAID, READY_TO_SHIP, PROCESSED, SHIPPED, COMPLETED, IN_CANCEL, CANCELLED, INVOICE_PENDING |

**Response:**
```json
{
  "response": {
    "more": true/false,
    "next_cursor": "string",
    "order_list": [
      {
        "order_sn": "string",
        "order_status": "READY_TO_SHIP",
        "create_time": 1234567890,
        "update_time": 1234567890,
        "pay_time": 1234567890,
        "total_amount": 150000.0
      }
    ]
  }
}
```

**Notes:**
- `pay_time` is available in the list response but CANNOT be used as `time_range_field`
- No status filter = returns ALL statuses
- We DON'T filter by status so we get everything including UNPAID

### `get_order_detail` ⭐ ACTIVE
- **Path:** `/api/v2/order/get_order_detail`
- **Method:** GET

**Request Params:**
| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `order_sn_list` | string | Yes | Comma-separated, max **50** order SNs |
| `response_optional_fields` | string | No | Comma-separated optional fields |

**Available `response_optional_fields`:**
- `pay_time` — unix timestamp when buyer paid
- `item_list` — array of items in order
- `total_amount` — gross amount
- `buyer_total_amount` — what buyer actually paid (after vouchers)
- `buyer_username`
- `estimated_shipping_fee`
- `actual_shipping_fee`
- `payment_method`
- `buyer_user_id`
- `voucher_from_seller`
- `voucher_from_shopee`
- `note` — buyer's note
- `days_to_ship`
- `ship_by_date`
- `invoice_data`
- `checkout_shipping_carrier`
- `reverse_shipping_fee`

**Response `order_list[]` fields:**
| Field | Type | Description |
|-------|------|-------------|
| `order_sn` | string | Order ID |
| `order_status` | string | Status uppercase |
| `create_time` | int | Unix seconds |
| `update_time` | int | Unix seconds |
| `pay_time` | int | Unix seconds, buyer payment time |
| `total_amount` | float | Gross item total before vouchers (= GMV) |
| `buyer_total_amount` | float | What buyer actually paid after all discounts |
| `voucher_from_seller` | float | Seller-funded voucher amount |
| `voucher_from_shopee` | float | Shopee-funded voucher amount |
| `estimated_shipping_fee` | float | Estimated shipping |
| `actual_shipping_fee` | float | Actual shipping (available after delivery) |
| `item_list[]` | array | Order items |

**`item_list[]` fields:**
| Field | Type | Description |
|-------|------|-------------|
| `item_id` | int | Product ID |
| `item_name` | string | Product name |
| `item_sku` | string | SKU |
| `model_id` | int | Variant/model ID |
| `model_name` | string | Variant name |
| `model_sku` | string | Variant SKU |
| `model_quantity_purchased` | int | Qty bought |
| `model_original_price` | float | Price before discount |
| `model_discounted_price` | float | Price after discount |
| `weight` | float | Item weight |
| `add_on_deal` | bool | Is add-on deal item |
| `is_wholesale` | bool | Is wholesale purchase |

---

## 2. PAYMENT MODULE — Endpoints We Use

### `get_escrow_detail` ⭐ ACTIVE
- **Path:** `/api/v2/payment/get_escrow_detail`
- **Method:** GET
- **Note:** ONE order per call (slow for bulk)

**Request Params:**
| Param | Type | Required |
|-------|------|----------|
| `order_sn` | string | Yes |

**Response `order_income` fields:**
| Field | Type | Description |
|-------|------|-------------|
| `escrow_amount` | float | **Net amount to seller** after all deductions |
| `buyer_paid_amount` | float | Amount buyer paid (may differ from buyer_total_amount) |
| `buyer_total_amount` | float | Total charged to buyer |
| `original_price` | float | Original selling price |
| `seller_discount` | float | Seller's discount applied |
| `commission_fee` | float | Shopee platform commission |
| `service_fee` | float | Shopee service/transaction fee |
| `order_ams_commission_fee` | float | **AMS (Shopee Ads) fee per order** |
| `seller_order_processing_fee` | float | Per-order processing fee |
| `actual_shipping_fee` | float | Actual shipping cost |
| `shopee_shipping_rebate` | float | Shipping subsidy from Shopee |
| `buyer_paid_shipping_fee` | float | Shipping paid by buyer |
| `voucher_from_seller` | float | Seller voucher amount |
| `voucher_from_shopee` | float | Shopee voucher subsidy |
| `coins` | float | Shopee Coins used |
| `shopee_discount` | float | Shopee-funded discount |
| `order_selling_price` | float | Selling price of order |
| `order_income` | float | Net order income |
| `items[]` | array | Items with item_id, item_name, sku, model_id |

**Escrow Formula:**
```
escrow_amount = buyer_total_amount
  - commission_fee
  - service_fee
  - order_ams_commission_fee
  - seller_order_processing_fee
  + shopee_shipping_rebate
  - seller_return_refund_amount
  + final_shipping_fee
  - cross_border_tax (if applicable)
  - seller_coin_cash_back
```

### `get_escrow_detail_batch` 🔜 TODO
- **Path:** `/api/v2/payment/get_escrow_detail_batch`
- **Method:** POST
- **Batch:** Multiple order SNs per call (likely 50 max, needs verification)
- **Advantage:** Much faster than calling get_escrow_detail per order

**⚠️ Priority:** Migrate from single to batch once we verify the API spec

### `get_escrow_list` 🔜 USEFUL
- **Path:** `/api/v2/payment/get_escrow_list`
- Lists all orders with escrow in a time range
- Could replace our DB query for "which orders need escrow sync"

### `get_income_overview` / `get_income_report` 📊 FUTURE
- Aggregate income reports
- Could validate our calculated totals against Shopee's own aggregation

---

## 3. PRODUCT MODULE — For COGS Mapping

### `get_item_list` ⭐ ACTIVE (in sync-products)
- Lists all shop items with pagination
- Returns: item_id, item_status

### `get_item_base_info` ⭐ ACTIVE
- Batch: up to **50** item IDs per call
- Returns: item_name, item_sku, price_info, stock_info

### `get_model_list` ⭐ ACTIVE
- Gets variants/models for a single item
- Returns: model_id, model_name, model_sku, price, stock

**For COGS mapping, the flow is:**
```
order.item_list[].item_id → products table → cogs_per_unit
order.item_list[].model_quantity_purchased × cogs_per_unit = order COGS
```

---

## 4. AMS (Ads) MODULE — Phase 2

### Key Read Endpoints:
| Endpoint | Use |
|----------|-----|
| `get_shop_performance` | Overall ad spend & ROAS |
| `get_campaign_key_metrics_performance` | Per-campaign metrics |
| `get_product_performance` | Per-product ad spend |
| `get_open_campaign_performance` | Auto-campaign metrics |
| `get_targeted_campaign_performance` | Manual campaign metrics |
| `get_targeted_campaign_list` | List all campaigns |
| `get_affiliate_performance` | Affiliate program metrics |
| `get_conversion_report` | Conversion attribution |

**Note:** AMS fee is ALSO available per-order in `get_escrow_detail` → `order_ams_commission_fee`.
This means for basic ad spend tracking, we DON'T need AMS API — escrow already has it.
AMS API is needed for: campaign-level breakdowns, ROAS, keyword performance, affiliate details.

---

## 5. PROMOTION MODULES — Low Priority

### Discount API
- `get_discount_list` / `get_discount` — Track active promotions

### Bundle Deal API
- `get_bundle_deal_list` — Track bundle promotions

### Add-on Deal API
- `get_add_on_deal_list` — Track add-on deals

**These are informational only** — the financial impact is already captured in order detail (voucher fields) and escrow (actual deductions).

---

## 6. Mapping: API → Our Pipeline

### Current Pipeline (sync/orders → sync/details → sync/escrow)

| Our DB Field | API Source | Endpoint |
|-------------|-----------|----------|
| `order_id` | `order_sn` | get_order_list |
| `status` | `order_status` | get_order_list, get_order_detail |
| `created_at` | `create_time` | get_order_list |
| `paid_at` | `pay_time` | get_order_detail |
| `gmv` | `total_amount` | get_order_detail |
| `buyer_paid_amount` | `buyer_total_amount` | get_order_detail |
| `voucher_from_seller` | `voucher_from_seller` | get_order_detail |
| `voucher_from_shopee` | `voucher_from_shopee` | get_order_detail |
| `shipping_fee` | `estimated/actual_shipping_fee` | get_order_detail |
| `escrow_amount` | `escrow_amount` | get_escrow_detail |
| `commission_fee` | `commission_fee` | get_escrow_detail |
| `service_fee` | `service_fee` | get_escrow_detail |
| `ams_commission` | `order_ams_commission_fee` | get_escrow_detail |
| `processing_fee` | `seller_order_processing_fee` | get_escrow_detail |
| `cogs` | Manual input | Dashboard UI |

### Planned: Product → Order → COGS

| Step | API | Data |
|------|-----|------|
| 1. Sync products | `get_item_list` + `get_item_base_info` | item_id, name, sku, price |
| 2. User sets COGS | Dashboard UI | cogs_per_unit per product |
| 3. Link order items | `get_order_detail` → `item_list` | item_id, qty, price |
| 4. Calculate COGS | DB join | order_item.qty × product.cogs_per_unit |

---

## 7. Optimization Opportunities

### Short Term
1. **`get_escrow_detail_batch`** — Replace single-order escrow calls. Could process 50 orders per call instead of 1. This alone would make escrow sync ~50x faster.

2. **`get_escrow_list`** — Use as source for "which orders need escrow" instead of DB query. Guarantees we only try escrow for orders Shopee has data for.

### Medium Term
3. **`get_income_overview`** — Validate our totals against Shopee's aggregated numbers. Good for debugging discrepancies.

4. **AMS `get_shop_performance`** — Get total ad spend without per-order granularity. Quick win for profit calculation.

### Long Term
5. **AMS campaign APIs** — Full ad attribution per product/campaign.
6. **`get_income_report`** — Downloadable income reports for accounting.

---

## ADDENDUM: Additional API Modules Found

### Voucher Module (4 endpoints)
| Endpoint | Use |
|----------|-----|
| `get_voucher_list` | List active/past vouchers |
| `get_voucher` / `add_voucher` / `update_voucher` | Manage shop vouchers |

**⏱️ Priority:** LOW — Voucher financial impact already in order detail (voucher_from_seller) and escrow

### Ads Module (18 endpoints) — **MORE DETAILED THAN AMS**
| Endpoint | Use | Priority |
|----------|-----|----------|
| `get_all_cpc_ads_daily_performance` | Daily ad spend & ROAS | **HIGH** |
| `get_all_cpc_ads_hourly_performance` | Hourly ad performance | MEDIUM |
| `get_product_campaign_daily_performance` | Per-product ad spend daily | **HIGH** |
| `get_gms_campaign_performance` | GMS campaign metrics | MEDIUM |
| `get_gms_item_performance` | Per-item GMS metrics | MEDIUM |
| `get_shop_toggle_info` | Ad account status | USEFUL |
| `get_total_balance` | Ad account balance | USEFUL |
| **Edit endpoints** (edit_manual_product_ads, etc.) | Campaign management | Not needed |

**Note:** This "ads" module appears separate from AMS (ams.json). May have different granularity/fields. Check which one is current in Seller Center.

### Returns Module (6 endpoints)
| Endpoint | Use | Impact |
|----------|-----|--------|
| `get_return_list` | List return/refund requests | Affects GMV |
| `get_return_detail` | Return/refund details | Affects profit |
| `get_available_solutions` / `get_return_dispute_reason` | Resolution options | Operational |

**⏱️ Priority:** MEDIUM — Returns affect order status (RETURNED, REFUNDED in our order_status field)
- Returns are already captured in our escrow sync (seller_return_refund_amount)
- But dedicated returns API could help track return % KPI

**Impact on profit:**
```
When order is RETURNED/REFUNDED:
- Still counts in GMV (per Shopee definition)
- Does NOT count in "Order Aktif" (order count for profit)
- seller_return_refund_amount is deducted in escrow → already handled
```

---

## Module Priority Matrix for PT SGB

| Module | Current Use | Immediate (Week 1-2) | Near Term (Week 3-4) | Future |
|--------|------------|----------------------|----------------------|--------|
| **Order** | ✅ Active | Keep as-is | Optimize batch | Scale |
| **Payment (Escrow)** | ✅ Active | Upgrade to batch API | Optimize calls | Revenue reports |
| **Product** | ✅ Active | Keep for COGS | Add COGS input UI | Sync variants |
| **AMS (from ams.json)** | — | Evaluate vs Ads module | Pick one | Full campaign tracking |
| **Ads (from ads.json)** | — | Compare with AMS | Pick one | Daily reporting |
| **Voucher** | — | Skip | Skip | Informational only |
| **Returns** | — | Monitor for insights | Implement returns API | Return analytics |
| **Discount / Bundle / Add-on** | — | Skip | Skip | Promo analytics |
| Other modules (Livestream, SBS, Push, etc.) | — | Skip | Skip | Skip |

---

## Quick Decision Tree

**Q: Should we use AMS or Ads module for ad spend?**
- Both provide daily ad spend data
- **Recommend:** Check which endpoint Seller Center uses by default
- Implement the one that matches official numbers first
- Can add second later if needed

**Q: Should we sync Returns?**
- **Short answer:** Not immediately
- **Why:** Return impact (seller_return_refund_amount) already in escrow
- **Add later if:** User wants "return rate %" KPI or needs to flag high-return products

**Q: What about Voucher tracking?**
- **Answer:** Not needed for profit dashboard
- **Why:** Voucher amounts already in order detail (voucher_from_seller)
- **Useful only if:** User wants "how much did each voucher campaign cost" analytics

---

## Files to Keep as Reference

✅ Uploaded JSON files saved in project docs:
- order.json, payment.json, product.json — **CORE**
- ams.json, ads.json — **EVALUATE**
- returns.json, voucher.json — **BACKLOG**
- All others (livestream, sbs, push, etc.) — **ARCHIVE ONLY**
