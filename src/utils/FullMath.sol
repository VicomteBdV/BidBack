// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

error MulDivOverflow();
error MulDivByZero();

/// @dev Floor(x*y/denominator), using a 512-bit intermediate product.
/// The modular-inverse algorithm follows the standard Remco Bloemen/Uniswap
/// FullMath construction (MIT). Reverts when the quotient does not fit uint256.
library FullMath {
    function mulDiv(uint256 x, uint256 y, uint256 denominator) internal pure returns (uint256 result) {
        if (denominator == 0) revert MulDivByZero();
        unchecked {
            uint256 low;
            uint256 high;
            assembly ("memory-safe") {
                let mm := mulmod(x, y, not(0))
                low := mul(x, y)
                high := sub(sub(mm, low), lt(mm, low))
            }
            if (high == 0) return low / denominator;
            if (denominator <= high) revert MulDivOverflow();

            // Subtract the remainder from the full product to make division exact.
            uint256 remainder;
            assembly ("memory-safe") {
                remainder := mulmod(x, y, denominator)
                high := sub(high, gt(remainder, low))
                low := sub(low, remainder)
            }
            // Divide out powers of two and shift the high limb into the low limb.
            uint256 twos = denominator & (0 - denominator);
            assembly ("memory-safe") {
                denominator := div(denominator, twos)
                low := div(low, twos)
                twos := add(div(sub(0, twos), twos), 1)
            }
            low |= high * twos;
            // Invert the odd denominator modulo 2^256; six Newton steps double
            // the four correct seed bits to 256. All wrapping here is intentional.
            uint256 inverse = (3 * denominator) ^ 2;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            result = low * inverse;
        }
    }
}
