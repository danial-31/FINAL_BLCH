const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("PriceOracle", function () {
  async function deployOracleFixture() {
    const [owner, keeper, alice] = await ethers.getSigners();

    const TokenA = await ethers.getContractFactory("TokenA");
    const tokenA = await TokenA.deploy(owner.address);
    const TokenB = await ethers.getContractFactory("TokenB");
    const tokenB = await TokenB.deploy(owner.address);

    const AMMPool = await ethers.getContractFactory("AMMPool");
    const pool = await AMMPool.deploy(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      owner.address
    );

    // Add liquidity
    const amt = ethers.parseEther("10000");
    await tokenA.approve(await pool.getAddress(), amt);
    await tokenB.approve(await pool.getAddress(), amt);
    await pool.addLiquidity(amt, amt, 0, 0);

    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    const oracle = await PriceOracle.deploy(await pool.getAddress(), owner.address);

    await oracle.setKeeper(keeper.address, true);

    return { oracle, pool, tokenA, tokenB, owner, keeper, alice };
  }

  describe("Deployment", function () {
    it("sets pool address", async function () {
      const { oracle, pool } = await loadFixture(deployOracleFixture);
      expect(await oracle.pool()).to.equal(await pool.getAddress());
    });

    it("owner is keeper by default", async function () {
      const { oracle, owner } = await loadFixture(deployOracleFixture);
      expect(await oracle.isKeeper(owner.address)).to.be.true;
    });
  });

  describe("recordPrice", function () {
    it("keeper can record price", async function () {
      const { oracle, keeper } = await loadFixture(deployOracleFixture);
      await expect(oracle.connect(keeper).recordPrice())
        .to.emit(oracle, "PriceRecorded");
      expect(await oracle.observationCount()).to.equal(1);
    });

    it("non-keeper cannot record price", async function () {
      const { oracle, alice } = await loadFixture(deployOracleFixture);
      await expect(oracle.connect(alice).recordPrice())
        .to.be.revertedWith("PriceOracle: not keeper");
    });
  });

  describe("getTWAP", function () {
    it("reverts with insufficient observations", async function () {
      const { oracle } = await loadFixture(deployOracleFixture);
      await oracle.recordPrice();
      await expect(oracle.getTWAP()).to.be.revertedWith("PriceOracle: not enough observations");
    });

    it("returns TWAP with multiple observations", async function () {
      const { oracle } = await loadFixture(deployOracleFixture);
      await oracle.recordPrice();
      await time.increase(600); // 10 minutes
      await oracle.recordPrice();
      await time.increase(600);
      await oracle.recordPrice();

      const twap = await oracle.getTWAP();
      expect(twap).to.be.gt(0);
    });
  });

  describe("getLatestPrice", function () {
    it("returns current spot price", async function () {
      const { oracle } = await loadFixture(deployOracleFixture);
      const price = await oracle.getLatestPrice();
      expect(price).to.equal(ethers.parseEther("1")); // 1:1 pool
    });
  });

  describe("setKeeper", function () {
    it("owner can add keeper", async function () {
      const { oracle, owner, alice } = await loadFixture(deployOracleFixture);
      await expect(oracle.connect(owner).setKeeper(alice.address, true))
        .to.emit(oracle, "KeeperUpdated").withArgs(alice.address, true);
      expect(await oracle.isKeeper(alice.address)).to.be.true;
    });

    it("non-owner cannot set keeper", async function () {
      const { oracle, alice } = await loadFixture(deployOracleFixture);
      await expect(oracle.connect(alice).setKeeper(alice.address, true))
        .to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
    });
  });
});
