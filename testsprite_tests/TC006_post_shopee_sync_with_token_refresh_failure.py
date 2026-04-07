import requests

def test_post_shopee_sync_with_token_refresh_failure():
    base_url = "http://localhost:3000"
    url = f"{base_url}/api/shopee/sync?days=90"
    # Provide valid cookies but simulate token refresh failure expected to cause 401 error (not connected)
    cookies = {
        "shopee_access_token": "valid_access_token_simulated",
        "shopee_shop_id": "valid_shop_id_simulated",
        "shopee_refresh_token": "valid_refresh_token_simulated",
    }
    headers = {
        "Content-Type": "application/json"
    }
    timeout = 30
    try:
        response = requests.post(url, cookies=cookies, headers=headers, timeout=timeout)
    except requests.RequestException as e:
        assert False, f"Request to {url} failed with exception: {e}"

    # According to PRD, token refresh failure returns 401 Not connected to Shopee
    assert response.status_code == 401, (
        f"Expected status code 401 for token refresh failure, got {response.status_code}"
    )
    # Optionally check body message for error presence
    try:
        resp_json = response.json()
        assert (
            "error" in resp_json or
            ("message" in resp_json and len(resp_json.get("message", "")) > 0)
        ), "Response JSON should contain 'error' or 'message' key describing failure"
    except Exception:
        # Response might not be JSON or message missing, ignore
        pass

test_post_shopee_sync_with_token_refresh_failure()
