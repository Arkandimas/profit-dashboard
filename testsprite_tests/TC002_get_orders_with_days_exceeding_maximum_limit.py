import requests

def test_get_orders_days_exceeding_max():
    base_url = "http://localhost:3000"
    endpoint = "/api/orders"
    params = {"days": 200}
    headers = {
        "Accept": "application/json"
    }
    try:
        response = requests.get(f"{base_url}{endpoint}", params=params, headers=headers, timeout=30)
    except requests.exceptions.RequestException as req_err:
        assert False, f"Request error occurred: {req_err}"
    # According to PRD, days=200 returns 500 with error message
    assert response.status_code == 500, f"Expected status code 500, got {response.status_code}"
    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"
    assert isinstance(data, dict), f"Expected error response as dict, got {type(data)}"


test_get_orders_days_exceeding_max()