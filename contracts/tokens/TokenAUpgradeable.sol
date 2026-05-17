// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title TokenAUpgradeable - UUPS upgradeable version of TokenA
/// @notice Demonstrates UUPS proxy pattern with documented V1→V2 upgrade path
contract TokenAUpgradeable is 
    Initializable, 
    ERC20Upgradeable, 
    ERC20BurnableUpgradeable, 
    OwnableUpgradeable, 
    UUPSUpgradeable 
{
    uint256 public constant MAX_SUPPLY = 1_000_000 * 1e18;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __ERC20_init("Token Alpha Upgradeable", "TKAU");
        __ERC20Burnable_init();
        __Ownable_init(initialOwner);

        _mint(initialOwner, 500_000 * 1e18);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "TokenAUpgradeable: max supply exceeded");
        _mint(to, amount);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /**
     * @dev Returns the current version of the contract
     * V1: Initial implementation
     * V2: Will add transfer fee mechanism (see TokenAUpgradeableV2)
     */
    function version() public pure virtual returns (string memory) {
        return "1.0.0";
    }
}
