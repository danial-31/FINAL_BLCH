// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TokenAUpgradeable.sol";

/// @title TokenAUpgradeableV2 - V2 upgrade demonstrating new functionality
/// @notice Adds transfer fee mechanism (1% fee on transfers)
contract TokenAUpgradeableV2 is TokenAUpgradeable {
    // New storage variables MUST be added at the end to avoid storage collisions
    uint256 public transferFeeBps; // basis points (100 = 1%)
    address public feeCollector;

    event TransferFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeCollectorUpdated(address oldCollector, address newCollector);

    /// @notice Initialize V2 features (called after upgrade)
    function initializeV2(address _feeCollector) public reinitializer(2) {
        transferFeeBps = 100; // 1% default fee
        feeCollector = _feeCollector;
    }

    function setTransferFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 500, "TokenAUpgradeableV2: fee too high"); // max 5%
        emit TransferFeeUpdated(transferFeeBps, newFeeBps);
        transferFeeBps = newFeeBps;
    }

    function setFeeCollector(address newCollector) external onlyOwner {
        require(newCollector != address(0), "TokenAUpgradeableV2: zero address");
        emit FeeCollectorUpdated(feeCollector, newCollector);
        feeCollector = newCollector;
    }

    function _update(address from, address to, uint256 value) internal virtual override {
        // Apply fee on transfers (not on mint/burn)
        if (from != address(0) && to != address(0) && transferFeeBps > 0) {
            uint256 fee = (value * transferFeeBps) / 10_000;
            if (fee > 0) {
                super._update(from, feeCollector, fee);
                value -= fee;
            }
        }
        super._update(from, to, value);
    }

    function version() public pure override returns (string memory) {
        return "2.0.0";
    }
}
