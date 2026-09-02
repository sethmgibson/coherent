def persist_invoice(amount: int) -> int:
    return write_invoice(amount)


def write_invoice(amount: int) -> int:
    return amount


def after_return(flag: bool) -> int:
    if flag:
        return 1
        return 2
    return 0
