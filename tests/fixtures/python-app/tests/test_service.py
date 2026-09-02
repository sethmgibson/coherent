from src.billing.service import persist_charge


def test_persist_charge() -> None:
    assert persist_charge(3) == 3
