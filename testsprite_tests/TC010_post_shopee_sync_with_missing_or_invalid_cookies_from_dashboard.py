import requests

def test_post_shopee_sync_missing_or_invalid_cookies():
    base_url = "http://localhost:3000"
    endpoint = "/api/shopee/sync"
    url = f"{base_url}{endpoint}?days=30"
    headers = {
        "Content-Type": "application/json"
    }
    # Case 1: Missing cookies completely
    try:
        response = requests.post(url, headers=headers, timeout=30)
        assert response.status_code == 401, f"Expected 401 but got {response.status_code}"
        assert "Not connected to Shopee" in response.text or "Not connected" in response.text, "Expected not connected error message in response"
    except requests.RequestException as e:
        assert False, f"Request failed with exception: {e}"

    # Case 2: Invalid cookies (e.g., invalid values)
    invalid_cookies = {
        "shopee_access_token": "invalid_token",
        "shopee_shop_id": "invalid_shop_id"
    }
    try:
        response = requests.post(url, headers=headers, cookies=invalid_cookies, timeout=30)
        assert response.status_code == 401, f"Expected 401 but got {response.status_code}"
        assert "Not connected to Shopee" in response.text or "Not connected" in response.text, "Expected not connected error message in response"
    except requests.RequestException as e:
        assert False, f"Request failed with exception: {e}"


test_post_shopee_sync_missing_or_invalid_cookies()
