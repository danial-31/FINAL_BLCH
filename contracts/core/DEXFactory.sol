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

    /// @notice Deploy a new AMM pool for a token pair using CREATE
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
        getPool[t1][t0] = pool;
        allPools.push(pool);

        emit PoolCreated(t0, t1, pool, allPools.length);
    }

    /// @notice Deploy a new AMM pool using CREATE2 for deterministic address
    /// @param tokenA First token address
    /// @param tokenB Second token address
    /// @param salt Salt for CREATE2 (allows multiple pools for same pair)
    function createPool2(address tokenA, address tokenB, bytes32 salt)
        external returns (address pool)
    {
        require(tokenA != tokenB, "DEXFactory: identical tokens");
        require(tokenA != address(0) && tokenB != address(0), "DEXFactory: zero address");

        (address t0, address t1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);

        // Prepare bytecode for CREATE2
        bytes memory bytecode = abi.encodePacked(
            type(AMMPool).creationCode,
            abi.encode(t0, t1, owner())
        );

        // Deploy using CREATE2
        assembly {
            pool := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
            if iszero(extcodesize(pool)) {
                revert(0, 0)
            }
        }

        getPool[t0][t1] = pool;
        getPool[t1][t0] = pool;
        allPools.push(pool);

        emit PoolCreated(t0, t1, pool, allPools.length);
    }

    /// @notice Compute the CREATE2 address for a pool before deployment
    function computePool2Address(address tokenA, address tokenB, bytes32 salt)
        external view returns (address)
    {
        (address t0, address t1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);

        bytes memory bytecode = abi.encodePacked(
            type(AMMPool).creationCode,
            abi.encode(t0, t1, owner())
        );
        bytes32 hash = keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            keccak256(bytecode)
        ));
        return address(uint160(uint256(hash)));
    }

    function allPoolsLength() external view returns (uint256) {
        return allPools.length;
    }
}
