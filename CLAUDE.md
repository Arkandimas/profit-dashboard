@AGENTS.md

# Profit Dashboard — Project Context for Claude Code

## Project Overview
E-commerce profit dashboard for PT Sukses Gemilang Bangsa (PT SGB).
Tracks real net profit per product per storefront from Shopee marketplace.

**Live URL:** https://profit-dashboard-lilac.vercel.app
**Stack:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Supabase, Recharts

## Supabase
- Project ID: `fyhowdwscyzongvqtmli`
- Tables: products, storefronts, expenses, sales, cogs_entries
- Use typed Supabase client, never raw SQL strings

## Shopee API
- Partner ID: `1231100`
- Shop ID: `626110197`
- Status: Live/Online
- Key endpoint: `get_escrow_detail` for real revenue (after platform fees ~25%)
- TikTok Shop integration: DEFERRED — do not implement

## Architecture Rules
- Pages: /dashboard, /products, /expenses, /pnl, /campaigns
- All monetary values in IDR (Indonesian Rupiah)
- COGS entered manually per product
- Net Profit = Escrow Amount - COGS - Manual Expenses
- Platform fees are embedded in escrow, not calculated separately

## Code Standards
- TypeScript strict mode, no `any` types
- Always use Next.js 14 App Router patterns (not Pages Router)
- shadcn/ui components only — no raw HTML for UI elements
- Recharts for all data visualization
- Tailwind for all styling — no custom CSS files
- Never hardcode API credentials — use environment variables

## Environment Variables (never commit these)
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- SHOPEE_PARTNER_ID
- SHOPEE_PARTNER_KEY
- SHOPEE_SHOP_ID

## When Implementing Features
1. Check existing components in /components before creating new ones
2. Use server components by default, client components only when needed
3. All Shopee API calls go through /lib/shopee/ — never call API directly from components
4. Database queries go through /lib/db/ or Supabase client hooks
5. Run `npm run build` to verify TypeScript before marking task done

## Commands Available
- /plan — create implementation plan before starting
- /code-review — review before finalizing
- /build-fix — fix TypeScript/build errors
- /tdd — write tests first for critical logic

## Do NOT
- Install new npm packages without checking for existing alternatives first
- Modify Supabase schema without mentioning it explicitly
- Use Pages Router patterns (use App Router only)
- Implement TikTok Shop integration (explicitly deferred)
- Use `console.log` in production code
