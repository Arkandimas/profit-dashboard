import requests

def test_post_shopee_sync_with_valid_cookies_and_days():
    base_url = "http://localhost:3000"
    endpoint = "/api/shopee/sync"
    url = f"{base_url}{endpoint}"

    # Use example valid cookies for test - these should be replaced with real valid or test credentials
    cookies = {
        "shopee_access_token": "valid_access_token_example",
        "shopee_shop_id": "valid_shop_id_example"
    }
    params = {
        "days": 30
    }

    try:
        response = requests.post(url, params=params, cookies=cookies, timeout=30)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    # According to instructions and PRD, this endpoint may return 200 or 401 for fake credentials.
    # Valid credentials should result in 200 with sync details.
    if response.status_code == 200:
        json_data = None
        try:
            json_data = response.json()
        except ValueError:
            assert False, "Response is not valid JSON"
        # Expect keys: synced_count, chunks_count, days
        assert "synced_count" in json_data, "Missing 'synced_count' in response"
        assert "chunks_count" in json_data, "Missing 'chunks_count' in response"
        assert "days" in json_data, "Missing 'days' in response"

        # Validate days equals or less than requested days (clamped at max 90)
        assert isinstance(json_data["synced_count"], int) and json_data["synced_count"] >= 0, "'synced_count' must be a non-negative integer"
        assert isinstance(json_data["chunks_count"], int) and json_data["chunks_count"] >= 0, "'chunks_count' must be a non-negative integer"
        assert isinstance(json_data["days"], int) and 0 <= json_data["days"] <= 90, "'days' must be between 0 and 90"
    elif response.status_code == 401:
        # Acceptable if fake credentials return unauthorized
        assert "Not connected to Shopee" in response.text or "Unauthorized" in response.text
    else:
        assert False, f"Unexpected status code: {response.status_code} Response: {response.text}"

test_post_shopee_sync_with_valid_cookies_and_days()