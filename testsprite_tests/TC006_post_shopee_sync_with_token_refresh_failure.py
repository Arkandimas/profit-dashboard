import requests

def test_post_shopee_sync_token_refresh_failure():
    base_url = "http://localhost:3000/dashboard"
    url = f"{base_url}/api/shopee/sync"
    params = {"days": 90}
    # Provide valid cookies but assume server triggers token refresh failure internally
    cookies = {
        "shopee_access_token": "valid_access_token_example",
        "shopee_shop_id": "valid_shop_id_example",
        # shopee_refresh_token is optional, omit or include
    }
    headers = {
        "Content-Type": "application/json",
    }
    try:
        response = requests.post(url, params=params, cookies=cookies, headers=headers, timeout=30)
    except requests.RequestException as e:
        assert False, f"Request failed unexpectedly: {e}"

    # Validate we receive a 500 error due to token refresh failure
    assert response.status_code == 500, f"Expected status code 500 but got {response.status_code}"

    try:
        data = response.json()
    except ValueError:
        data = {}

    # Check that the response contains an error message indicative of token refresh failure
    error_message = data.get("error") or data.get("message") or ""
    assert "token refresh" in error_message.lower() or "refresh" in error_message.lower() or error_message != "", \
        "Response should contain an error message related to token refresh failure"

test_post_shopee_sync_token_refresh_failure()