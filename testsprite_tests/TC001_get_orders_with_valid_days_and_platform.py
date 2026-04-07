import requests

def test_get_orders_with_valid_days_and_platform():
    base_url = "http://localhost:3000"
    endpoint = "/api/orders"
    params = {"days": 30, "platform": "Shopee"}
    timeout = 30
    headers = {"Accept": "application/json"}

    try:
        response = requests.get(f"{base_url}{endpoint}", params=params, headers=headers, timeout=timeout)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 200, f"Expected status 200 but got {response.status_code}"

    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    assert isinstance(data, list), f"Expected response to be a list but got {type(data)}"

    # Validate that all orders returned have platform "Shopee" and exclude non-revenue statuses
    for order in data:
        # Each order should be a dict containing at least a platform key, and a status indicating revenue status
        assert isinstance(order, dict), f"Order is not a dict but {type(order)}"
        platform = order.get("platform")
        assert platform == "Shopee", f"Order platform expected 'Shopee' but got {platform}"
        status = order.get("status")
        # Based on PRD, non-revenue statuses should be excluded, so status should not be in a known non-revenue list.
        # We don't have exact list of non-revenue statuses, so ensure status exists and is not null/empty
        assert status is not None and status != "", "Order status is missing or empty"

# Execute the test function
test_get_orders_with_valid_days_and_platform()
