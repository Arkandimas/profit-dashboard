import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_get_orders_with_unsupported_platform():
    url = f"{BASE_URL}/api/orders"
    params = {
        "platform": "UnknownPlatform"
    }
    try:
        response = requests.get(url, params=params, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    if response.status_code == 200:
        try:
            data = response.json()
        except ValueError:
            assert False, "Response is not valid JSON"
        # Expecting an empty list of orders for unsupported platform or similar structure
        assert isinstance(data, list), f"Expected list of orders, got {type(data)}"
        assert len(data) == 0, f"Expected empty list for unsupported platform, got {len(data)} orders"
    elif response.status_code == 500:
        try:
            error_resp = response.json()
        except ValueError:
            error_resp = response.text
        assert "error" in str(error_resp).lower() or "exception" in str(error_resp).lower(), \
            f"Expected error message in 500 response, got: {error_resp}"
    else:
        assert False, f"Unexpected status code {response.status_code}, response: {response.text}"

test_get_orders_with_unsupported_platform()
