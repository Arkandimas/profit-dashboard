import requests

def test_post_shopee_sync_without_authentication_cookies():
    base_url = "http://localhost:3000"
    url = f"{base_url}/api/shopee/sync?days=30"
    headers = {
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(url, headers=headers, timeout=30)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 401, f"Expected status code 401, got {response.status_code}"
    try:
        json_resp = response.json()
    except ValueError:
        json_resp = None

    # The PRD states the response body for 401 is "Not connected to Shopee"
    if json_resp and isinstance(json_resp, dict):
        # If JSON response is an error message string or object, verify content
        msg = json_resp.get('message') or json_resp.get('error') or str(json_resp)
        assert "Not connected to Shopee" in msg, f"Unexpected error message: {msg}"
    else:
        # If response is plain text or missing json, check text content
        text = response.text or ""
        assert "Not connected to Shopee" in text, f"Unexpected response text: {text}"

test_post_shopee_sync_without_authentication_cookies()