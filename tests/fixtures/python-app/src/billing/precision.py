from __future__ import annotations

from billing.service import lookup, write_charge


def load_from_catalog(user_id: str) -> str | None:
    try:
        return lookup(user_id)
    except Exception:
        catalog("miss")
        return None


def catalog(name: str) -> str:
    return name


def login_result(user_id: str) -> LoginResult:
    try:
        return LoginResult(lookup(user_id))
    except Exception:
        return LoginResult(user_id)


class LoginResult:
    def __init__(self, user_id: str) -> None:
        self.user_id = user_id


def after_named_exception(user_id: str) -> str | None:
    try:
        return lookup(user_id)
    except Exception:
        fail_item_after_exception(user_id)
        return None


def fail_item_after_exception(user_id: str) -> None:
    return None


def load_or_log_event(user_id: str) -> None:
    try:
        lookup(user_id)
    except Exception:
        log_event("miss")


def log_event(message: str) -> None:
    return None


def forward_all(*args, **kwargs):
    return write_charge(*args, **kwargs)


def forward_kwonly(amount: int, *, label: str) -> int:
    return tagged_charge(amount, label=label)


def tagged_charge(amount: int, *, label: str) -> int:
    return amount


def forward_keywords(amount: int) -> int:
    return write_charge(amount=amount)


def not_star_mismatch(value: int) -> int:
    return write_charge(*other)


other = (1,)
