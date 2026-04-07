import requests

def test_get_orders_with_invalid_large_days_parameter():
    base_url = "http://localhost:3000"
    params = {"days": 3650}
    url = f"{base_url}/api/orders"
    timeout = 30

    try:
        response = requests.get(url, params=params, timeout=timeout)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    # According to the instructions, TC009 actually expects 200 with days clamped, not 500
    assert response.status_code == 200, f"Expected status code 200 but got {response.status_code}"

    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    # Validate data is a list (Order[])
    assert isinstance(data, list), "Response JSON should be a list of orders"

# Execute the test
test_get_orders_with_invalid_large_days_parameter()