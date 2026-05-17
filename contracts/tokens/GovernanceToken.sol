// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title GovernanceToken - ERC20Votes token for on-chain governance
contract GovernanceToken is ERC20Votes, ERC20Permit, Ownable {
    uint256 public constant MAX_SUPPLY = 10_000_000 * 1e18;

    constructor(address initialOwner)
        ERC20("DEX Governance Token", "DGT")
        ERC20Permit("DEX Governance Token")
        Ownable(initialOwner)
    {
        _mint(initialOwner, 1_000_000 * 1e18);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "GovernanceToken: max supply exceeded");
        _mint(to, amount);
    }

    // Required overrides for ERC20Votes + ERC20Permit
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
