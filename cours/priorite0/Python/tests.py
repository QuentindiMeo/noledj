from sandbox import (
    Money,
    round_significant,
    fib,
    uncached_fib,
    OrderItem,
    run_cached,
    run_uncached,
    Order,
    CreditCardPayment,
)


def test_round_significant() -> None:
    assert round_significant(0) == 0
    assert round_significant(1234.5678) == 1230
    assert round_significant(0.0012345678) == 0.00123
    assert round_significant(-9876.54321, sig=2) == -9900


def test_round_significant_edge_cases() -> None:
    assert round_significant(1.2345678, sig=5) == 1.2346
    assert round_significant(-0.000987654321, sig=4) == -0.0009877
    assert round_significant(1000, sig=2) == 1000
    assert round_significant(0.0001, sig=3) == 0.0001


def test_round_significant_large_numbers() -> None:
    assert round_significant(123456789.987654321, sig=6) == 123457000
    assert round_significant(-987654321.123456789, sig=5) == -987650000
    assert round_significant(1e10, sig=4) == 1e10
    assert round_significant(-1e-10, sig=3) == -1e-10


def test_round_significant_small_numbers() -> None:
    assert round_significant(0.000000123456789, sig=5) == 0.00000012346
    assert round_significant(-0.000000987654321, sig=4) == -0.0000009877
    assert round_significant(1e-10, sig=3) == 1e-10
    assert round_significant(-1e-10, sig=2) == -1e-10


def test_round_significant_various_cases() -> None:
    assert round_significant(3.141592653589793, sig=4) == 3.142
    assert round_significant(-2.718281828459045, sig=3) == -2.72
    assert round_significant(0.000123456789, sig=6) == 0.000123457
    assert round_significant(-0.000987654321, sig=5) == -0.00098765


def test_round_significant_zero() -> None:
    assert round_significant(0, sig=3) == 0
    assert round_significant(0, sig=5) == 0
    assert round_significant(0, sig=10) == 0


def test_fib_edge_cases() -> None:
    assert fib(0) == 0
    assert fib(1) == 1
    assert fib(2) == 1
    assert fib(3) == 2
    assert fib(4) == 3
    assert fib(5) == 5


def test_fib_large_numbers() -> None:
    assert fib(40) == 102334155
    assert fib(45) == 1134903170
    assert fib(50) == 12586269025
    assert fib(60) == 1548008755920


def test_fib_performance() -> None:
    from time import time

    start_time = time()
    fib(35)  # This should be fast due to caching
    end_time = time()
    assert (end_time - start_time) < 0.1  # Should take less than 0.1 seconds


def test_fib_consistency() -> None:
    for n in range(20):
        assert fib(n) == fib(n)  # Should always return the same result
    for n in range(20):
        assert fib(n) == uncached_fib(n)  # Should always return the same result


def test_fib_large_input() -> None:
    try:
        fib(1000)  # This will raise RecursionError due to Python's recursion limit
    except RecursionError:
        pass  # Expected behavior for large input


def test_fib_negative_input() -> None:
    try:
        fib(-1)  # This should raise a ValueError for negative input
        assert False, "Expected ValueError for negative input"
    except ValueError:
        pass  # Expected behavior

    try:
        uncached_fib(-1)  # This should also raise a ValueError for negative input
        assert False, "Expected ValueError for negative input"
    except ValueError:
        pass  # Expected behavior


def test_money_operations() -> None:
    m1 = Money(1000, "EUR")
    m2 = Money(2000, "EUR")
    m3 = Money(1500, "USD")

    assert (m1 + m2).amount == 3000
    assert (m1 - m2).amount == -1000
    assert (m1 * 2).amount == 2000
    assert (3 * m1).amount == 3000

    try:
        _ = m1 + m3
        assert False, "Expected ValueError for different currencies"
    except ValueError:
        pass  # Expected behavior

    try:
        _ = m1 - m3
        assert False, "Expected ValueError for different currencies"
    except ValueError:
        pass  # Expected behavior


def test_money_str() -> None:
    m = Money(12345, "EUR")
    assert str(m) == "123.45 EUR"

    m = Money(67890, "USD")
    assert str(m) == "678.90 USD"


def test_order_item_validation() -> None:
    try:
        _ = OrderItem(sku="A", quantity=1, unit_price=Money(0, "EUR"))
        assert False, "Expected ValueError for zero unit price"
    except ValueError:
        pass  # Expected behavior


def test_order_item_negative_unit_price() -> None:
    try:
        _ = OrderItem(sku="B", quantity=1, unit_price=Money(-100, "EUR"))
        assert False, "Expected ValueError for negative unit price"
    except ValueError:
        pass  # Expected behavior


def test_order_item_negative_quantity() -> None:
    try:
        _ = OrderItem(sku="C", quantity=-1, unit_price=Money(100, "EUR"))
        assert False, "Expected ValueError for negative quantity"
    except ValueError:
        pass  # Expected behavior


def test_order_total() -> None:
    items = [
        OrderItem(sku="A", quantity=2, unit_price=Money(500, "EUR")),
        OrderItem(sku="B", quantity=3, unit_price=Money(300, "EUR")),
    ]
    order = Order(id="O-1", items=items, method=CreditCardPayment(card="4242..."))

    expected_total = Money(500 * 2 + 300 * 3, "EUR")
    assert order.total.amount == expected_total.amount
    assert order.total.currency == expected_total.currency


def test_order_total_init() -> None:
    items = [
        OrderItem(sku="A", quantity=1, unit_price=Money(1000, "EUR")),
        OrderItem(sku="B", quantity=2, unit_price=Money(2000, "EUR")),
    ]
    try:
        _ = Order(
            id="O-2",
            items=items,
            method=CreditCardPayment(card="1234..."),
            total=Money(0, "EUR"),
        )
        assert False, "Expected TypeError for providing total during initialization"
    except TypeError:
        pass  # Expected behavior since total is init=False


def test_run_cached_and_uncached() -> None:
    cached_order = run_cached(item_range=22)
    uncached_order = run_uncached(item_range=22)

    assert cached_order.total.amount == uncached_order.total.amount
    assert cached_order.total.currency == uncached_order.total.currency
