import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_get_orders_with_valid_days_and_all_platforms():
    params = {
        "days": 30,
        "platform": "All"
    }
    try:
        response = requests.get(f"{BASE_URL}/api/orders", params=params, timeout=TIMEOUT)
        assert response.status_code == 200, f"Expected status 200, got {response.status_code}"
        orders = response.json()
        assert isinstance(orders, list), f"Response should be a list, got {type(orders)}"
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

test_get_orders_with_valid_days_and_all_platforms()
