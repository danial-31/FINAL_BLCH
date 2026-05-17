// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./AMMPool.sol";

/// @title DEXFactory - Deploys and tracks AMM pools
contract DEXFactory is Ownable {
    // tokenA => tokenB => pool address
    mapping(address => mapping(address => address)) public getPool;
    address[] public allPools;

    event PoolCreated(address indexed tokenA, address indexed tokenB, address pool, uint256 poolCount);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Deploy a new AMM pool for a token pair
    function createPool(address tokenA, address tokenB)
        external returns (address pool)
    {
        require(tokenA != tokenB, "DEXFactory: identical tokens");
        require(tokenA != address(0) && tokenB != address(0), "DEXFactory: zero address");

        // Canonical ordering
        (address t0, address t1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);

        require(getPool[t0][t1] == address(0), "DEXFactory: pool exists");

        pool = address(new AMMPool(t0, t1, owner()));
        getPool[t0][t1] = pool;
        getPool[t1][t0] = pool; // reverse lookup
        allPools.push(pool);

        emit PoolCreated(t0, t1, pool, allPools.length);
    }

    function allPoolsLength() external view returns (uint256) {
        return allPools.length;
    }
}
