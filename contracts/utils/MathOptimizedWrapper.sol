// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./MathOptimized.sol";

/// @title MathOptimizedWrapper - Wrapper contract for testing library functions
contract MathOptimizedWrapper {
    using MathOptimized for *;

    function sqrtSolidity(uint256 y) external pure returns (uint256) {
        return MathOptimized.sqrtSolidity(y);
    }

    function sqrtYul(uint256 y) external pure returns (uint256) {
        return MathOptimized.sqrtYul(y);
    }

    function mulDivSolidity(uint256 a, uint256 b, uint256 c) external pure returns (uint256) {
        return MathOptimized.mulDivSolidity(a, b, c);
    }

    function mulDivYul(uint256 a, uint256 b, uint256 c) external pure returns (uint256) {
        return MathOptimized.mulDivYul(a, b, c);
    }

    function isEvenSolidity(uint256 n) external pure returns (bool) {
        return MathOptimized.isEvenSolidity(n);
    }

    function isEvenYul(uint256 n) external pure returns (bool) {
        return MathOptimized.isEvenYul(n);
    }

    function sumArraySolidity(uint256[] memory arr) external pure returns (uint256) {
        return MathOptimized.sumArraySolidity(arr);
    }

    function sumArrayYul(uint256[] memory arr) external pure returns (uint256) {
        return MathOptimized.sumArrayYul(arr);
    }
}
