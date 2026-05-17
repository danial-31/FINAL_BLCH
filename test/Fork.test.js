const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Fork Tests", function () {
  // These tests require MAINNET_RPC_URL in .env
  // Run with: FORK=true npx hardhat test test/Fork.test.js

  // Skip fork tests if FORK is not enabled
  const shouldRun = process.env.FORK === "true";
  const describeOrSkip = shouldRun ? describe : describe.skip;

  describeOrSkip("Chainlink Price Feed Integration", function () {
    it("reads ETH/USD price from mainnet Chainlink", async function () {
      // ETH/USD price feed on Ethereum mainnet
      const CHAINLINK_ETH_USD = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
      
      const aggregator = await ethers.getContractAt(
        ["function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)"],
        CHAINLINK_ETH_USD
      );

      const [, price, , updatedAt] = await aggregator.latestRoundData();
      
      expect(price).to.be.gt(0);
      expect(updatedAt).to.be.gt(0);
      console.log(`      ETH/USD Price: $${ethers.formatUnits(price, 8)}`);
      console.log(`      Updated: ${new Date(Number(updatedAt) * 1000).toISOString()}`);
    });

    it("checks price staleness", async function () {
      const CHAINLINK_ETH_USD = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
      const aggregator = await ethers.getContractAt(
        ["function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)"],
        CHAINLINK_ETH_USD
      );

      const [, , , updatedAt] = await aggregator.latestRoundData();
      const now = Math.floor(Date.now() / 1000);
      const age = now - Number(updatedAt);

      expect(age).to.be.lt(3600); // Price should be less than 1 hour old
      console.log(`      Price age: ${age} seconds`);
    });
  });

  describeOrSkip("Uniswap V2 Integration", function () {
    it("reads reserves from USDC/WETH pool", async function () {
      // Uniswap V2 USDC/WETH pair on mainnet
      const USDC_WETH_PAIR = "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc";
      
      const pair = await ethers.getContractAt(
        ["function getReserves() external view returns (uint112, uint112, uint32)"],
        USDC_WETH_PAIR
      );

      const [reserve0, reserve1] = await pair.getReserves();
      
      expect(reserve0).to.be.gt(0);
      expect(reserve1).to.be.gt(0);
      console.log(`      USDC Reserve: ${ethers.formatUnits(reserve0, 6)}`);
      console.log(`      WETH Reserve: ${ethers.formatEther(reserve1)}`);
    });

    it("calculates price from Uniswap reserves", async function () {
      const USDC_WETH_PAIR = "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc";
      const pair = await ethers.getContractAt(
        ["function getReserves() external view returns (uint112, uint112, uint32)"],
        USDC_WETH_PAIR
      );

      const [reserve0, reserve1] = await pair.getReserves();
      
      // Price = reserve0 / reserve1 (adjusted for decimals)
      const price = (BigInt(reserve0) * BigInt(1e18)) / BigInt(reserve1) / BigInt(1e6);
      
      expect(price).to.be.gt(1000); // ETH should be > $1000
      expect(price).to.be.lt(10000); // ETH should be < $10000
      console.log(`      ETH Price from Uniswap: $${price}`);
    });
  });

  describeOrSkip("USDC Token Integration", function () {
    it("reads USDC total supply", async function () {
      const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
      
      const usdc = await ethers.getContractAt(
        ["function totalSupply() external view returns (uint256)", "function decimals() external view returns (uint8)"],
        USDC
      );

      const supply = await usdc.totalSupply();
      const decimals = await usdc.decimals();
      
      expect(supply).to.be.gt(0);
      expect(decimals).to.equal(6);
      console.log(`      USDC Total Supply: ${ethers.formatUnits(supply, 6)}`);
    });

    it("checks USDC balance of Uniswap router", async function () {
      const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
      const UNISWAP_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
      
      const usdc = await ethers.getContractAt(
        ["function balanceOf(address) external view returns (uint256)"],
        USDC
      );

      const balance = await usdc.balanceOf(UNISWAP_ROUTER);
      console.log(`      Uniswap Router USDC Balance: ${ethers.formatUnits(balance, 6)}`);
    });
  });
});
