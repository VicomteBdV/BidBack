// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FullMath, MulDivOverflow, MulDivByZero} from "../src/utils/FullMath.sol";

interface VmFullMath {
    function expectRevert(bytes4 selector) external;
}

contract FullMathHarness {
    function mulDiv(uint256 x, uint256 y, uint256 denominator) external pure returns (uint256) {
        return FullMath.mulDiv(x, y, denominator);
    }
}

contract FullMathTest {
    VmFullMath private constant vm = VmFullMath(address(uint160(uint256(keccak256("hevm cheat code")))));
    FullMathHarness private math;

    function setUp() external { math = new FullMathHarness(); }

    function testZeroDenominatorRevertsEvenForZeroProduct() external {
        vm.expectRevert(MulDivByZero.selector);
        math.mulDiv(0, 0, 0);
        vm.expectRevert(MulDivByZero.selector);
        math.mulDiv(type(uint256).max, type(uint256).max, 0);
    }

    function testOverflowQuotientRevertsAtHighLimbBoundary() external {
        vm.expectRevert(MulDivOverflow.selector);
        math.mulDiv(1 << 255, 2, 1);
        require(math.mulDiv(1 << 255, 2, 2) == 1 << 255, "boundary quotient");
        vm.expectRevert(MulDivOverflow.selector);
        math.mulDiv(type(uint256).max, type(uint256).max, type(uint256).max - 1);
    }

    function testMaxOperandsAndNonExact512BitDivision() external view {
        uint256 m = type(uint256).max;
        require(math.mulDiv(m, m, m) == m, "max operands");
        require(math.mulDiv(m, m - 1, m) == m - 1, "max nonidentical operands");
        require(math.mulDiv(1 << 200, 1 << 100, 1 << 50) == 1 << 250, "power of two divisor");
        // floor(2^256/3), with an odd denominator and nonzero remainder.
        require(math.mulDiv(1 << 128, 1 << 128, 3) == m / 3, "512-bit odd divisor");
        require(math.mulDiv(7, 8, 3) == 18, "ordinary floor");
        require(math.mulDiv(0, m, 1) == 0, "zero product");
    }

    function testFuzzSmallProductMatchesNative(uint128 x, uint128 y, uint128 rawDenominator) external view {
        uint256 d = uint256(rawDenominator) + 1;
        require(math.mulDiv(x, y, d) == uint256(x) * y / d, "native exact reference");
    }

    function testFuzzFullProductIdentity(uint256 x, uint256 y) external view {
        if (y == 0) y = 1;
        require(math.mulDiv(x, y, y) == x, "full product cancellation");
    }

    function testFuzzHighLimbFloorAndRemainder(uint128 rawX, uint128 rawD) external view {
        uint256 x = (uint256(rawX) << 128) | 1;
        uint256 d = uint256(rawD) + 2;
        // x*(d-1)/d = x-ceil(x/d), an independent non-overflowing reference.
        uint256 ceil = x / d + (x % d == 0 ? 0 : 1);
        require(math.mulDiv(x, d - 1, d) == x - ceil, "high limb floor reference");
    }
}
