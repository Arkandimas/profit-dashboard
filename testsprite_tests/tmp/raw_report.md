
# TestSprite AI Testing Report(MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** profit-dashboard
- **Date:** 2026-04-04
- **Prepared by:** TestSprite AI Team

---

## 2️⃣ Requirement Validation Summary

#### Test TC001 get orders with valid days and platform
- **Test Code:** [TC001_get_orders_with_valid_days_and_platform.py](./TC001_get_orders_with_valid_days_and_platform.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 48, in <module>
  File "<string>", line 25, in test_get_orders_with_valid_days_and_platform
AssertionError: Expected status 200, got 500

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/d7b93b25-ca28-47da-bdc8-44de642a50df/3b293013-b473-4d5b-ab75-cb0bfad51099
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC002 get orders with days exceeding maximum limit
- **Test Code:** [TC002_get_orders_with_days_exceeding_maximum_limit.py](./TC002_get_orders_with_days_exceeding_maximum_limit.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/d7b93b25-ca28-47da-bdc8-44de642a50df/9fefbbbd-9a86-4e17-b598-168bedc3ad2b
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC003 get orders with unsupported platform
- **Test Code:** [TC003_get_orders_with_unsupported_platform.py](./TC003_get_orders_with_unsupported_platform.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 31, in <module>
  File "<string>", line 14, in test_get_orders_with_unsupported_platform
AssertionError: Unexpected status code: 404

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/d7b93b25-ca28-47da-bdc8-44de642a50df/9a86b85c-6842-4ad8-9ca1-c0048f39501e
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC004 post shopee sync with valid cookies and days
- **Test Code:** [TC004_post_shopee_sync_with_valid_cookies_and_days.py](./TC004_post_shopee_sync_with_valid_cookies_and_days.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 45, in <module>
  File "<string>", line 26, in test_post_shopee_sync_with_valid_cookies_and_days
AssertionError: Expected 200 OK but got 401, response: {"error":"Not connected to Shopee. Please connect in Settings."}

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/d7b93b25-ca28-47da-bdc8-44de642a50df/3d1b60a6-7d58-43ef-ba08-c6006cab4e34
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC005 post shopee sync without authentication cookies
- **Test Code:** [TC005_post_shopee_sync_without_authentication_cookies.py](./TC005_post_shopee_sync_without_authentication_cookies.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/d7b93b25-ca28-47da-bdc8-44de642a50df/a4565f7d-2383-4f34-8c6f-4c213107d32a
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC006 post shopee sync with token refresh failure
- **Test Code:** [TC006_post_shopee_sync_with_token_refresh_failure.py](./TC006_post_shopee_sync_with_token_refresh_failure.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 34, in <module>
  File "<string>", line 22, in test_post_shopee_sync_token_refresh_failure
AssertionError: Expected status code 500 but got 404

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/d7b93b25-ca28-47da-bdc8-44de642a50df/838c16ec-c8b2-4efe-9752-8e9c7eb92e6e
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC007 post shopee sync with zero days parameter
- **Test Code:** [TC007_post_shopee_sync_with_zero_days_parameter.py](./TC007_post_shopee_sync_with_zero_days_parameter.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 33, in <module>
  File "<string>", line 18, in test_post_shopee_sync_with_zero_days_parameter
AssertionError: Expected 200 OK but got 401

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/d7b93b25-ca28-47da-bdc8-44de642a50df/a92998d8-36c8-4873-92cf-25e0132b9af3
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC008 get orders with valid days and all platforms
- **Test Code:** [TC008_get_orders_with_valid_days_and_all_platforms.py](./TC008_get_orders_with_valid_days_and_all_platforms.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 19, in <module>
  File "<string>", line 13, in test_get_orders_with_valid_days_and_all_platforms
AssertionError: Expected status 200, got 500

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/d7b93b25-ca28-47da-bdc8-44de642a50df/a22c6d3a-25e5-4783-89ac-531499775dd1
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC009 get orders with invalid large days parameter from date range picker
- **Test Code:** [TC009_get_orders_with_invalid_large_days_parameter_from_date_range_picker.py](./TC009_get_orders_with_invalid_large_days_parameter_from_date_range_picker.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/d7b93b25-ca28-47da-bdc8-44de642a50df/cf88c7ca-a394-49c4-95f1-ec4183add308
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC010 post shopee sync with missing or invalid cookies from dashboard
- **Test Code:** [TC010_post_shopee_sync_with_missing_or_invalid_cookies_from_dashboard.py](./TC010_post_shopee_sync_with_missing_or_invalid_cookies_from_dashboard.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/d7b93b25-ca28-47da-bdc8-44de642a50df/3faa24fe-8865-4520-8bae-ed5c8b0ff5f7
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---


## 3️⃣ Coverage & Matching Metrics

- **40.00** of tests passed

| Requirement        | Total Tests | ✅ Passed | ❌ Failed  |
|--------------------|-------------|-----------|------------|
| ...                | ...         | ...       | ...        |
---


## 4️⃣ Key Gaps / Risks
{AI_GNERATED_KET_GAPS_AND_RISKS}
---