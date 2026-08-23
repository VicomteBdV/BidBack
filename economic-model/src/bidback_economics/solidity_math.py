"""Solidity 0.8 unsigned-integer semantics used by the baseline."""

from __future__ import annotations

from .types import SolidityDivisionByZero, SolidityOverflow, SolidityUnderflow

UINT8_MAX = 2**8 - 1
UINT16_MAX = 2**16 - 1
UINT64_MAX = 2**64 - 1
UINT256_MAX = 2**256 - 1


def _maximum(bits: int) -> int:
    if bits not in (8, 16, 64, 256):
        raise ValueError(f"unsupported uint width: {bits}")
    return 2**bits - 1


def validate_typed_uint(value: int, bits: int, *, operation: str = "typed-input") -> int:
    """Validate a value that enters Solidity already typed as uint<bits>."""

    if isinstance(value, bool) or not isinstance(value, int) or value < 0 or value > _maximum(bits):
        raise SolidityOverflow(
            "Solidity checked arithmetic overflow",
            phase="arithmetic",
            operation=operation,
            context={"bits": bits, "value": value},
        )
    return value


def explicit_unsigned_cast(
    value: int,
    target_bits: int,
    *,
    source_bits: int = 256,
    operation: str = "explicit-uint-cast",
) -> int:
    """Reproduce an explicit unsigned narrowing cast, which truncates high bits."""

    validate_typed_uint(value, source_bits, operation=operation)
    _maximum(target_bits)
    return value & _maximum(target_bits)


def checked_add(a: int, b: int, *, bits: int = 256, operation: str = "add") -> int:
    validate_typed_uint(a, bits, operation=operation)
    validate_typed_uint(b, bits, operation=operation)
    result = a + b
    if result > _maximum(bits):
        raise SolidityOverflow(
            "Solidity checked arithmetic overflow",
            phase="arithmetic",
            operation=operation,
            context={"a": a, "b": b, "bits": bits},
        )
    return result


def checked_sub(a: int, b: int, *, bits: int = 256, operation: str = "sub") -> int:
    validate_typed_uint(a, bits, operation=operation)
    validate_typed_uint(b, bits, operation=operation)
    if b > a:
        raise SolidityUnderflow(
            "Solidity checked arithmetic underflow",
            phase="arithmetic",
            operation=operation,
            context={"a": a, "b": b, "bits": bits},
        )
    return a - b


def checked_mul(a: int, b: int, *, bits: int = 256, operation: str = "mul") -> int:
    validate_typed_uint(a, bits, operation=operation)
    validate_typed_uint(b, bits, operation=operation)
    result = a * b
    if result > _maximum(bits):
        raise SolidityOverflow(
            "Solidity checked arithmetic overflow",
            phase="arithmetic",
            operation=operation,
            context={"a": a, "b": b, "bits": bits},
        )
    return result


def checked_div(a: int, b: int, *, bits: int = 256, operation: str = "div") -> int:
    validate_typed_uint(a, bits, operation=operation)
    validate_typed_uint(b, bits, operation=operation)
    if b == 0:
        raise SolidityDivisionByZero(
            "Solidity division by zero",
            phase="arithmetic",
            operation=operation,
            context={"a": a, "b": b, "bits": bits},
        )
    return a // b
