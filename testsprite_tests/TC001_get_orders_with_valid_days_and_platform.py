import requests

def test_get_orders_with_valid_days_and_platform():
    base_url = "http://localhost:3000"
    endpoint = "/api/orders"
    params = {
        "days": 30,
        "platform": "Shopee"
    }
    headers = {
        "Accept": "application/json"
    }
    timeout = 30

    try:
        response = requests.get(
            url=f"{base_url}{endpoint}",
            params=params,
            headers=headers,
            timeout=timeout
        )
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 200, f"Expected status 200, got {response.status_code}"

    try:
        orders = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    assert isinstance(orders, list), "Response JSON is not a list"

    # Validate each order has expected platform and revenue status (since non-revenue statuses are excluded)
    # As PRD does not define order schema fields precisely, we check minimal assumptions:
    # Assuming each order dict has a 'platform' field equal to 'Shopee'
    for order in orders:
        assert isinstance(order, dict), "Each order should be a dict"
        platform = order.get("platform")
        assert platform == "Shopee", f"Order platform expected 'Shopee', got {platform}"

        # Check that order status is revenue generating - 
        # Since non-revenue statuses excluded by API, presence of 'status' is assumed and should be revenue
        # But PRD does not specify status values, so we just assert 'status' exists and is truthy
        status = order.get("status")
        assert status, "Order missing or empty 'status' field"

test_get_orders_with_valid_days_and_platform()