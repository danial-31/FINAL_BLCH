// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../core/AMMPool.sol";

/// @title PriceOracle - TWAP oracle reading prices from the AMM pool
/// @notice Provides time-weighted average price to resist manipulation
contract PriceOracle is Ownable {
    struct Observation {
        uint256 timestamp;
        uint256 price; // tokenA price in tokenB, scaled 1e18
    }

    AMMPool public immutable pool;

    Observation[] public observations;
    uint256 public constant TWAP_PERIOD = 30 minutes;
    uint256 public constant MIN_OBSERVATIONS = 2;

    // Authorized price updaters (keepers)
    mapping(address => bool) public isKeeper;

    event PriceRecorded(uint256 timestamp, uint256 price);
    event KeeperUpdated(address keeper, bool status);

    modifier onlyKeeper() {
        require(isKeeper[msg.sender] || msg.sender == owner(), "PriceOracle: not keeper");
        _;
    }

    constructor(address _pool, address initialOwner) Ownable(initialOwner) {
        require(_pool != address(0), "PriceOracle: zero address");
        pool = AMMPool(_pool);
        isKeeper[initialOwner] = true;
    }

    /// @notice Record current spot price as an observation
    function recordPrice() external onlyKeeper {
        uint256 currentPrice = pool.getSpotPrice();
        observations.push(Observation({
            timestamp: block.timestamp,
            price: currentPrice
        }));
        emit PriceRecorded(block.timestamp, currentPrice);
    }

    /// @notice Get TWAP over the last TWAP_PERIOD
    function getTWAP() external view returns (uint256 twap) {
        uint256 len = observations.length;
        require(len >= MIN_OBSERVATIONS, "PriceOracle: not enough observations");

        uint256 cutoff = block.timestamp - TWAP_PERIOD;
        uint256 weightedSum;
        uint256 totalTime;

        for (uint256 i = len - 1; i > 0; i--) {
            Observation memory curr = observations[i];
            Observation memory prev = observations[i - 1];

            if (curr.timestamp < cutoff) break;

            uint256 start = prev.timestamp < cutoff ? cutoff : prev.timestamp;
            uint256 duration = curr.timestamp - start;
            weightedSum += prev.price * duration;
            totalTime += duration;
        }

        require(totalTime > 0, "PriceOracle: no data in period");
        twap = weightedSum / totalTime;
    }

    /// @notice Get latest spot price directly from pool
    function getLatestPrice() external view returns (uint256) {
        return pool.getSpotPrice();
    }

    /// @notice Number of recorded observations
    function observationCount() external view returns (uint256) {
        return observations.length;
    }

    function setKeeper(address keeper, bool status) external onlyOwner {
        isKeeper[keeper] = status;
        emit KeeperUpdated(keeper, status);
    }
}
