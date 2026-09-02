from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter

router = APIRouter()
logger = logging.getLogger(__name__)


def persist_charge(amount: int) -> int:
    return write_charge(amount)


def write_charge(amount: int) -> int:
    return amount


def authorize_and_charge(user_id: str, amount: int) -> int:
    if not user_id:
        raise ValueError("unauthorized")
    return write_charge(amount)


def after_return(flag: bool) -> int:
    if flag:
        return 1
        return 2
    return 0


def after_return_in_with(path: str) -> str:
    with open(path, encoding="utf-8") as handle:
        return handle.read()
        return "dead"


def first_or_default(items: list[int]) -> int:
    for item in items:
        return item
    else:
        return 0


def dead_false_branch() -> str:
    if False:
        return "never"
    return "ok"


def create_order(
    is_gift: bool,
    rush: bool,
    notify: bool,
    dry_run: bool,
) -> str:
    if dry_run:
        return "preview"
    if is_gift and rush:
        return "gift-rush"
    if notify:
        return "notify"
    return "ok"


def toggle_feature(enabled: bool, verbose: bool) -> str:
    if enabled:
        return "on-loud" if verbose else "on"
    return "off"


def load_user(user_id: str) -> str | None:
    try:
        return lookup(user_id)
    except Exception:
        return None


def load_or_log(user_id: str) -> str:
    try:
        return lookup(user_id)
    except Exception as error:
        logger.info("lookup failed", exc_info=error)
        return "fallback"


def load_and_ignore(user_id: str) -> None:
    try:
        lookup(user_id)
    except Exception as error:
        logger.info("ignored", exc_info=error)


def load_or_rethrow(user_id: str) -> str:
    try:
        return lookup(user_id)
    except Exception:
        raise


def load_or_translate(user_id: str) -> str:
    try:
        return lookup(user_id)
    except Exception as error:
        raise RuntimeError(f"lookup failed: {error}") from error


def load_all(ids: list[str]) -> list[str]:
    loaded: list[str] = []
    for item in ids:
        try:
            loaded.append(lookup(item))
        except Exception:
            continue
    return loaded


def lookup(user_id: str) -> str:
    if not user_id:
        raise ValueError("missing")
    return user_id


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def public_lookup(name: str) -> Any:
    return globals().get(name)


def unused_looking_helper() -> int:
    return 1
