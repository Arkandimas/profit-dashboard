# Profit Dashboard Product Spec

## Overview
A web dashboard for tracking profit, orders, products, expenses, and profit-and-loss performance for ecommerce operations, including Shopee integration workflows.

## Main goals
- Show high-level business performance in a dashboard
- Track orders and product sales
- Track expenses and ad spend
- Show profit and loss summaries
- Support Shopee connection and sync workflows

## Main pages
- `/dashboard`: KPI overview and summary metrics
- `/orders`: order list and order-related metrics
- `/products`: product performance and catalog insights
- `/expenses`: expense tracking and summaries
- `/pnl`: profit and loss reporting
- `/settings`: integration settings, including Shopee connection
- `/login`: login form

## Key user flows
- User opens the dashboard and sees business summary metrics
- User reviews orders and product performance
- User checks expenses and profit-and-loss summaries
- User opens Settings and manages Shopee connection
- User triggers Shopee sync-related actions and returns to dashboard insights

## Important behaviors to test
- Main pages load without crashing
- Navigation between dashboard sections works
- Dashboard summary metrics render correctly
- Orders, products, expenses, and P&L pages display usable states
- Settings page shows Shopee connection controls and status messaging
- Login page renders correctly and accepts submission
- Pages handle empty, loading, and error states gracefully where applicable

## Test boundaries
- Focus on local frontend workflows and visible user behavior
- Prefer safe local interaction over live third-party account mutations
- Do not rely on live Shopee OAuth completion unless explicitly configured
