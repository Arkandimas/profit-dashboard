import requests

def test_post_shopee_sync_missing_or_invalid_cookies():
    base_url = "http://localhost:3000"
    url = f"{base_url}/api/shopee/sync?days=30"
    timeout = 30

    # Case 1: Missing cookies
    response_missing = requests.post(url, timeout=timeout)
    assert response_missing.status_code == 401, f"Expected 401 for missing cookies, got {response_missing.status_code}"
    assert "Not connected to Shopee" in response_missing.text or "not connected" in response_missing.text.lower()

    # Case 2: Invalid cookies
    invalid_cookies = {
        "shopee_access_token": "invalidtoken",
        "shopee_shop_id": "invalidshopid"
    }
    response_invalid = requests.post(url, cookies=invalid_cookies, timeout=timeout)
    # Server should respond with 401 for invalid cookies as well
    assert response_invalid.status_code == 401, f"Expected 401 for invalid cookies, got {response_invalid.status_code}"
    assert "Not connected to Shopee" in response_invalid.text or "not connected" in response_invalid.text.lower()


test_post_shopee_sync_missing_or_invalid_cookies()