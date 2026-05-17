const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("DEXFactory", function () {
  async function deployFactoryFixture() {
    const [owner, alice] = await ethers.getSigners();

    const TokenA = await ethers.getContractFactory("TokenA");
    const tokenA = await TokenA.deploy(owner.address);
    const TokenB = await ethers.getContractFactory("TokenB");
    const tokenB = await TokenB.deploy(owner.address);

    const DEXFactory = await ethers.getContractFactory("DEXFactory");
    const factory = await DEXFactory.deploy(owner.address);

    return { factory, tokenA, tokenB, owner, alice };
  }

  it("creates a pool for a token pair", async function () {
    const { factory, tokenA, tokenB } = await loadFixture(deployFactoryFixture);
    await expect(factory.createPool(await tokenA.getAddress(), await tokenB.getAddress()))
      .to.emit(factory, "PoolCreated");
    expect(await factory.allPoolsLength()).to.equal(1);
  });

  it("reverts creating duplicate pool", async function () {
    const { factory, tokenA, tokenB } = await loadFixture(deployFactoryFixture);
    await factory.createPool(await tokenA.getAddress(), await tokenB.getAddress());
    await expect(
      factory.createPool(await tokenA.getAddress(), await tokenB.getAddress())
    ).to.be.revertedWith("DEXFactory: pool exists");
  });

  it("reverts with identical tokens", async function () {
    const { factory, tokenA } = await loadFixture(deployFactoryFixture);
    await expect(
      factory.createPool(await tokenA.getAddress(), await tokenA.getAddress())
    ).to.be.revertedWith("DEXFactory: identical tokens");
  });

  it("supports reverse lookup", async function () {
    const { factory, tokenA, tokenB } = await loadFixture(deployFactoryFixture);
    await factory.createPool(await tokenA.getAddress(), await tokenB.getAddress());
    const pool1 = await factory.getPool(await tokenA.getAddress(), await tokenB.getAddress());
    const pool2 = await factory.getPool(await tokenB.getAddress(), await tokenA.getAddress());
    expect(pool1).to.equal(pool2);
  });
});
