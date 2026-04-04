import requests

def test_get_orders_with_invalid_large_days_parameter():
    base_url = "http://localhost:3000"
    endpoint = "/api/orders"
    params = {
        "days": 3650,
        "platform": "All"
    }
    headers = {
        "Accept": "application/json"
    }

    try:
        response = requests.get(
            url=base_url + endpoint,
            params=params,
            headers=headers,
            timeout=30
        )
    except requests.RequestException as e:
        assert False, f"Request failed with exception: {e}"

    assert response.status_code == 500, f"Expected status code 500, got {response.status_code}"

    try:
        error_message = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    assert isinstance(error_message, dict), "Error response should be a JSON object"
    assert any(
        key in error_message for key in ["error", "message"]
    ), "Error response JSON should contain 'error' or 'message' key"
    assert len(error_message.get("error", "") or error_message.get("message", "")) > 0, "Error message should not be empty"

test_get_orders_with_invalid_large_days_parameter()
