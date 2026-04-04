import requests

def test_get_orders_days_exceeding_max_limit():
    base_url = "http://localhost:3000"
    endpoint = "/api/orders"
    params = {
        "days": 200
    }
    headers = {
        "Accept": "application/json"
    }
    try:
        response = requests.get(
            url=f"{base_url}{endpoint}",
            params=params,
            headers=headers,
            timeout=30
        )
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 500, f"Expected 500 status code but got {response.status_code}"
    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not a valid JSON"

    # The error message could be under different keys, typically "error", "message", or top-level string.
    error_message = None
    if isinstance(data, dict):
        error_message = data.get("error") or data.get("message")
    elif isinstance(data, str):
        error_message = data

    assert error_message is not None and len(error_message) > 0, "Expected an error message in response body"

test_get_orders_days_exceeding_max_limit()