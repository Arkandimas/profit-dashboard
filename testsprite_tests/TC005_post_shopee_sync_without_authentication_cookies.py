import requests

def test_post_shopee_sync_without_authentication_cookies():
    base_url = "http://localhost:3000"
    url = f"{base_url}/api/shopee/sync"
    params = {"days": 30}
    timeout = 30

    try:
        response = requests.post(url, params=params, timeout=timeout)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 401, f"Expected status code 401, got {response.status_code}"
    try:
        json_resp = response.json()
    except ValueError:
        json_resp = {}

    # Validate error message content if available
    if json_resp:
        expected_error_message = "Not connected to Shopee"
        # The message might be in different keys; check keys for this message
        errors = [str(v).lower() for v in json_resp.values() if isinstance(v, str)]
        assert any(expected_error_message.lower() in err for err in errors), \
            f"Expected error message containing '{expected_error_message}', got {json_resp}"

test_post_shopee_sync_without_authentication_cookies()
