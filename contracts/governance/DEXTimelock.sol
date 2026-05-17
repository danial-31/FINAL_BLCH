// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title DEXTimelock - TimelockController for governance execution delay
/// @notice Enforces a minimum delay between proposal passing and execution
contract DEXTimelock is TimelockController {
    /// @param minDelay Minimum delay in seconds (e.g. 2 days = 172800)
    /// @param proposers Addresses allowed to schedule (Governor contract)
    /// @param executors Addresses allowed to execute (address(0) = anyone)
    /// @param admin Initial admin (should be renounced after setup)
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(minDelay, proposers, executors, admin) {}
}
