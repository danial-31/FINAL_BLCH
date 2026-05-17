// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title TokenA - ERC20 token used as first pair asset in the DEX
contract TokenA is ERC20, ERC20Burnable, Ownable {
    uint256 public constant MAX_SUPPLY = 1_000_000 * 1e18;

    constructor(address initialOwner)
        ERC20("Token Alpha", "TKA")
        Ownable(initialOwner)
    {
        _mint(initialOwner, 500_000 * 1e18);
    }

    /// @notice Mint new tokens, only owner (used for testing / initial liquidity)
    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "TokenA: max supply exceeded");
        _mint(to, amount);
    }
}
