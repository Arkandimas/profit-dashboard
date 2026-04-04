import requests

def test_post_shopee_sync_with_valid_cookies_and_days():
    base_url = "http://localhost:3000"
    endpoint = "/api/shopee/sync"
    params = {"days": 30}
    # Set example valid cookies (should be replaced with real valid values)
    cookies = {
        "shopee_access_token": "valid_access_token_example",
        "shopee_shop_id": "valid_shop_id_example"
    }
    headers = {
        "Content-Type": "application/json",
    }
    timeout = 30

    try:
        response = requests.post(
            url=f"{base_url}{endpoint}",
            params=params,
            cookies=cookies,
            headers=headers,
            timeout=timeout
        )
        # Check HTTP Status Code
        assert response.status_code == 200, f"Expected 200 OK but got {response.status_code}, response: {response.text}"

        # Validate JSON response content
        json_data = response.json()
        assert isinstance(json_data, dict), "Response JSON should be an object"
        assert "synced_count" in json_data, "Missing 'synced_count' in response"
        assert isinstance(json_data["synced_count"], int), "'synced_count' should be an integer"
        assert "chunks_count" in json_data, "Missing 'chunks_count' in response"
        assert isinstance(json_data["chunks_count"], int), "'chunks_count' should be an integer"
        assert "days" in json_data, "Missing 'days' in response"
        assert json_data["days"] == 30, f"Expected 'days' to be 30 but got {json_data['days']}"

        # Additional sanity checks on values
        assert json_data["synced_count"] >= 0, "'synced_count' should be non-negative"
        assert json_data["chunks_count"] >= 0, "'chunks_count' should be non-negative"

    except requests.exceptions.RequestException as e:
        assert False, f"Request failed: {e}"

test_post_shopee_sync_with_valid_cookies_and_days()