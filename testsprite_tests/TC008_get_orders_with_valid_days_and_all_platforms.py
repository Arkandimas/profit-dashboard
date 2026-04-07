import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_get_orders_with_valid_days_and_all_platforms():
    url = f"{BASE_URL}/api/orders"
    params = {
        "days": 30,
        "platform": "All"
    }
    try:
        response = requests.get(url, params=params, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request to {url} failed: {e}"
    if response.status_code in (401, 403):
        assert False, f"Unauthorized or forbidden access: HTTP {response.status_code}"
    assert response.status_code == 200, f"Expected 200 OK but received {response.status_code}"
    try:
        orders = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"
    assert isinstance(orders, list), "Response JSON is not a list"
    # Further validation can check orders content but no schema details provided.
    # Check each order has some expected keys (best effort)
    if orders:
        sample_order = orders[0]
        assert isinstance(sample_order, dict), "Order item is not a JSON object"
        expected_keys = ["id", "platform", "status"]
        for key in expected_keys:
            assert key in sample_order, f"Order missing expected key: {key}"

test_get_orders_with_valid_days_and_all_platforms()
