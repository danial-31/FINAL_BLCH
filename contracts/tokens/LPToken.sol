// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title LPToken - Liquidity Provider token minted/burned by the AMM pool
contract LPToken is ERC20, Ownable {
    constructor(address pool)
        ERC20("DEX LP Token", "DLP")
        Ownable(pool)
    {}

    /// @notice Only the pool contract can mint LP tokens
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Only the pool contract can burn LP tokens
    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}
