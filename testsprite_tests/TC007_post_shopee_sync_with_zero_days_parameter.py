import requests

def test_post_shopee_sync_zero_days():
    base_url = "http://localhost:3000"
    url = f"{base_url}/api/shopee/sync?days=0"
    cookies = {
        "shopee_access_token": "fake_valid_token",
        "shopee_shop_id": "fake_valid_shop_id"
    }
    try:
        response = requests.post(url, cookies=cookies, timeout=30)
        assert response.status_code in (200, 401), f"Unexpected status code: {response.status_code}"
        if response.status_code == 200:
            json_data = response.json()
            assert isinstance(json_data, dict), "Response JSON is not a dict"
            assert "synced_count" in json_data, "'synced_count' key missing in response"
            assert json_data["synced_count"] == 0, f"Expected synced_count 0, got {json_data['synced_count']}"
        else:
            assert response.text.lower().find("not connected") != -1 or response.text.lower().find("unauthorized") != -1, \
                f"Expected 401 with appropriate message, got: {response.text}"
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

test_post_shopee_sync_zero_days()
