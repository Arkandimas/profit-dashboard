import requests

def test_post_shopee_sync_with_zero_days_parameter():
    base_url = "http://localhost:3000"
    url = f"{base_url}/api/shopee/sync?days=0"
    # Dummy valid cookies for authentication as required by API
    cookies = {
        "shopee_access_token": "valid_access_token_example",
        "shopee_shop_id": "valid_shop_id_example"
    }
    headers = {
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(url, headers=headers, cookies=cookies, timeout=30)
        # Validate response status code
        assert response.status_code == 200, f"Expected 200 OK but got {response.status_code}"
        
        json_data = response.json()
        # Validate that response contains synced_count zero
        assert "synced_count" in json_data, "Response JSON missing 'synced_count'"
        assert json_data["synced_count"] == 0, f"Expected synced_count 0 but got {json_data['synced_count']}"
        # Validate days returned matches 0
        assert "days" in json_data, "Response JSON missing 'days'"
        assert json_data["days"] == 0, f"Expected days 0 but got {json_data['days']}"
        # Validate chunks_count is present (any int including zero)
        assert "chunks_count" in json_data, "Response JSON missing 'chunks_count'"
        assert isinstance(json_data["chunks_count"], int), f"'chunks_count' expected to be int but got {type(json_data['chunks_count'])}"
    except requests.exceptions.RequestException as e:
        assert False, f"Request failed: {str(e)}"

test_post_shopee_sync_with_zero_days_parameter()