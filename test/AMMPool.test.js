const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("AMMPool", function () {
  // ── Fixture ────────────────────────────────────────────────────────────────
  async function deployPoolFixture() {
    const [owner, alice, bob] = await ethers.getSigners();

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

    const lpToken = await ethers.getContractAt("LPToken", await pool.lpToken());

    // Distribute tokens
    const amount = ethers.parseEther("100000");
    await tokenA.transfer(alice.address, amount);
    await tokenB.transfer(alice.address, amount);
    await tokenA.transfer(bob.address, amount);
    await tokenB.transfer(bob.address, amount);

    return { pool, tokenA, tokenB, lpToken, owner, alice, bob };
  }

  async function deployWithLiquidityFixture() {
    const base = await deployPoolFixture();
    const { pool, tokenA, tokenB, alice } = base;

    const amtA = ethers.parseEther("10000");
    const amtB = ethers.parseEther("10000");
    await tokenA.connect(alice).approve(await pool.getAddress(), amtA);
    await tokenB.connect(alice).approve(await pool.getAddress(), amtB);
    await pool.connect(alice).addLiquidity(amtA, amtB, 0, 0);

    return base;
  }

  // ── Deployment ─────────────────────────────────────────────────────────────
  describe("Deployment", function () {
    it("sets correct token addresses", async function () {
      const { pool, tokenA, tokenB } = await loadFixture(deployPoolFixture);
      expect(await pool.tokenA()).to.equal(await tokenA.getAddress());
      expect(await pool.tokenB()).to.equal(await tokenB.getAddress());
    });

    it("deploys LP token owned by pool", async function () {
      const { pool, lpToken } = await loadFixture(deployPoolFixture);
      expect(await lpToken.owner()).to.equal(await pool.getAddress());
    });

    it("reverts with identical tokens", async function () {
      const { tokenA, owner } = await loadFixture(deployPoolFixture);
      const AMMPool = await ethers.getContractFactory("AMMPool");
      await expect(
        AMMPool.deploy(await tokenA.getAddress(), await tokenA.getAddress(), owner.address)
      ).to.be.revertedWith("AMMPool: identical tokens");
    });

    it("reverts with zero address", async function () {
      const { tokenA, owner } = await loadFixture(deployPoolFixture);
      const AMMPool = await ethers.getContractFactory("AMMPool");
      await expect(
        AMMPool.deploy(await tokenA.getAddress(), ethers.ZeroAddress, owner.address)
      ).to.be.revertedWith("AMMPool: zero address");
    });
  });

  // ── Add Liquidity ──────────────────────────────────────────────────────────
  describe("addLiquidity", function () {
    it("mints LP tokens on first deposit", async function () {
      const { pool, tokenA, tokenB, lpToken, alice } = await loadFixture(deployPoolFixture);
      const amtA = ethers.parseEther("1000");
      const amtB = ethers.parseEther("1000");

      await tokenA.connect(alice).approve(await pool.getAddress(), amtA);
      await tokenB.connect(alice).approve(await pool.getAddress(), amtB);

      await expect(pool.connect(alice).addLiquidity(amtA, amtB, 0, 0))
        .to.emit(pool, "LiquidityAdded");

      expect(await lpToken.balanceOf(alice.address)).to.be.gt(0);
    });

    it("updates reserves after deposit", async function () {
      const { pool, tokenA, tokenB, alice } = await loadFixture(deployPoolFixture);
      const amtA = ethers.parseEther("5000");
      const amtB = ethers.parseEther("5000");

      await tokenA.connect(alice).approve(await pool.getAddress(), amtA);
      await tokenB.connect(alice).approve(await pool.getAddress(), amtB);
      await pool.connect(alice).addLiquidity(amtA, amtB, 0, 0);

      const [rA, rB] = await pool.getReserves();
      expect(rA).to.equal(amtA);
      expect(rB).to.equal(amtB);
    });

    it("second deposit maintains ratio", async function () {
      const { pool, tokenA, tokenB, lpToken, alice, bob } = await loadFixture(deployWithLiquidityFixture);

      const amtA = ethers.parseEther("1000");
      const amtB = ethers.parseEther("1000");
      await tokenA.connect(bob).approve(await pool.getAddress(), amtA);
      await tokenB.connect(bob).approve(await pool.getAddress(), amtB);
      await pool.connect(bob).addLiquidity(amtA, amtB, 0, 0);

      expect(await lpToken.balanceOf(bob.address)).to.be.gt(0);
    });
  });

  // ── Remove Liquidity ───────────────────────────────────────────────────────
  describe("removeLiquidity", function () {
    it("burns LP and returns tokens", async function () {
      const { pool, tokenA, tokenB, lpToken, alice } = await loadFixture(deployWithLiquidityFixture);

      const lpBalance = await lpToken.balanceOf(alice.address);
      const halfLP = lpBalance / 2n;

      const balABefore = await tokenA.balanceOf(alice.address);
      await pool.connect(alice).removeLiquidity(halfLP, 0, 0);
      const balAAfter = await tokenA.balanceOf(alice.address);

      expect(balAAfter).to.be.gt(balABefore);
      expect(await lpToken.balanceOf(alice.address)).to.equal(lpBalance - halfLP);
    });

    it("reverts with zero LP amount", async function () {
      const { pool, alice } = await loadFixture(deployWithLiquidityFixture);
      await expect(pool.connect(alice).removeLiquidity(0, 0, 0))
        .to.be.revertedWith("AMMPool: zero LP amount");
    });

    it("reverts when slippage exceeded", async function () {
      const { pool, lpToken, alice } = await loadFixture(deployWithLiquidityFixture);
      const lpBalance = await lpToken.balanceOf(alice.address);
      await expect(
        pool.connect(alice).removeLiquidity(lpBalance, ethers.MaxUint256, 0)
      ).to.be.revertedWith("AMMPool: insufficient A output");
    });
  });

  // ── Swap ───────────────────────────────────────────────────────────────────
  describe("swapAForB", function () {
    it("swaps tokenA for tokenB", async function () {
      const { pool, tokenA, tokenB, bob } = await loadFixture(deployWithLiquidityFixture);

      const amountIn = ethers.parseEther("100");
      await tokenA.connect(bob).approve(await pool.getAddress(), amountIn);

      const balBefore = await tokenB.balanceOf(bob.address);
      await expect(pool.connect(bob).swapAForB(amountIn, 0))
        .to.emit(pool, "Swap");
      const balAfter = await tokenB.balanceOf(bob.address);

      expect(balAfter).to.be.gt(balBefore);
    });

    it("reverts on zero input", async function () {
      const { pool, bob } = await loadFixture(deployWithLiquidityFixture);
      await expect(pool.connect(bob).swapAForB(0, 0))
        .to.be.revertedWith("AMMPool: zero input");
    });

    it("reverts when slippage exceeded", async function () {
      const { pool, tokenA, bob } = await loadFixture(deployWithLiquidityFixture);
      const amountIn = ethers.parseEther("100");
      await tokenA.connect(bob).approve(await pool.getAddress(), amountIn);
      await expect(pool.connect(bob).swapAForB(amountIn, ethers.MaxUint256))
        .to.be.revertedWith("AMMPool: slippage exceeded");
    });
  });

  describe("swapBForA", function () {
    it("swaps tokenB for tokenA", async function () {
      const { pool, tokenA, tokenB, bob } = await loadFixture(deployWithLiquidityFixture);

      const amountIn = ethers.parseEther("100");
      await tokenB.connect(bob).approve(await pool.getAddress(), amountIn);

      const balBefore = await tokenA.balanceOf(bob.address);
      await pool.connect(bob).swapBForA(amountIn, 0);
      const balAfter = await tokenA.balanceOf(bob.address);

      expect(balAfter).to.be.gt(balBefore);
    });
  });

  // ── getAmountOut ───────────────────────────────────────────────────────────
  describe("getAmountOut", function () {
    it("returns less than input due to fee", async function () {
      const { pool } = await loadFixture(deployWithLiquidityFixture);
      const amountIn = ethers.parseEther("100");
      const [rA, rB] = await pool.getReserves();
      const out = await pool.getAmountOut(amountIn, rA, rB);
      // With 0.3% fee and equal reserves, output < input
      expect(out).to.be.lt(amountIn);
    });

    it("reverts with zero reserves", async function () {
      const { pool } = await loadFixture(deployPoolFixture);
      await expect(pool.getAmountOut(100, 0, 1000))
        .to.be.revertedWith("AMMPool: insufficient liquidity");
    });
  });

  // ── Admin ──────────────────────────────────────────────────────────────────
  describe("setFee", function () {
    it("owner can update fee", async function () {
      const { pool, owner } = await loadFixture(deployPoolFixture);
      await expect(pool.connect(owner).setFee(50))
        .to.emit(pool, "FeeUpdated").withArgs(30, 50);
      expect(await pool.feeBps()).to.equal(50);
    });

    it("reverts if fee too high", async function () {
      const { pool, owner } = await loadFixture(deployPoolFixture);
      await expect(pool.connect(owner).setFee(101))
        .to.be.revertedWith("AMMPool: fee too high");
    });

    it("non-owner cannot set fee", async function () {
      const { pool, alice } = await loadFixture(deployPoolFixture);
      await expect(pool.connect(alice).setFee(50))
        .to.be.revertedWithCustomError(pool, "OwnableUnauthorizedAccount");
    });
  });

  // ── Spot Price ─────────────────────────────────────────────────────────────
  describe("getSpotPrice", function () {
    it("returns 1e18 for equal reserves", async function () {
      const { pool } = await loadFixture(deployWithLiquidityFixture);
      const price = await pool.getSpotPrice();
      expect(price).to.equal(ethers.parseEther("1"));
    });

    it("reverts with no liquidity", async function () {
      const { pool } = await loadFixture(deployPoolFixture);
      await expect(pool.getSpotPrice()).to.be.revertedWith("AMMPool: no liquidity");
    });
  });
});
