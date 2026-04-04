import requests

BASE_URL = "http://localhost:3000/dashboard"
TIMEOUT = 30

def test_get_orders_with_unsupported_platform():
    url = f"{BASE_URL}/api/orders"
    params = {"platform": "UnknownPlatform"}
    try:
        response = requests.get(url, params=params, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code in (200, 500), f"Unexpected status code: {response.status_code}"

    if response.status_code == 200:
        try:
            orders = response.json()
        except ValueError:
            assert False, "Response is not valid JSON"

        assert isinstance(orders, list), f"Expected response to be a list but got {type(orders)}"
        # Accept empty list or any list as long as no error
    elif response.status_code == 500:
        try:
            error_message = response.json()
            assert isinstance(error_message, dict) or isinstance(error_message, str), "Error message must be dict or string"
        except ValueError:
            assert False, "Response error message is not valid JSON"

test_get_orders_with_unsupported_platform()