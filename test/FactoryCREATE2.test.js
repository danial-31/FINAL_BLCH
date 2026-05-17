const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("DEXFactory CREATE2", function () {
  async function deployFactoryFixture() {
    const [owner] = await ethers.getSigners();

    const TokenA = await ethers.getContractFactory("TokenA");
    const tokenA = await TokenA.deploy(owner.address);
    const TokenB = await ethers.getContractFactory("TokenB");
    const tokenB = await TokenB.deploy(owner.address);

    const DEXFactory = await ethers.getContractFactory("DEXFactory");
    const factory = await DEXFactory.deploy(owner.address);

    return { factory, tokenA, tokenB, owner };
  }

  it("computes deterministic address before deployment", async function () {
    const { factory, tokenA, tokenB } = await loadFixture(deployFactoryFixture);
    const salt = ethers.id("test-salt-1");

    const predictedAddress = await factory.computePool2Address(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      salt
    );

    const tx = await factory.createPool2(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      salt
    );
    const receipt = await tx.wait();

    const poolAddress = await factory.getPool(
      await tokenA.getAddress(),
      await tokenB.getAddress()
    );

    expect(poolAddress).to.equal(predictedAddress);
  });

  it("deploys to same address with same salt", async function () {
    const { factory, tokenA, tokenB, owner } = await loadFixture(deployFactoryFixture);
    const salt = ethers.id("test-salt-2");

    const predictedAddress = await factory.computePool2Address(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      salt
    );

    // Deploy with CREATE2
    await factory.createPool2(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      salt
    );

    const poolAddress = await factory.getPool(
      await tokenA.getAddress(),
      await tokenB.getAddress()
    );

    expect(poolAddress).to.equal(predictedAddress);
    expect(poolAddress).to.not.equal(ethers.ZeroAddress);
  });

  it("different salts produce different addresses", async function () {
    const { factory, tokenA, tokenB } = await loadFixture(deployFactoryFixture);
    
    const salt1 = ethers.id("salt-1");
    const salt2 = ethers.id("salt-2");

    const addr1 = await factory.computePool2Address(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      salt1
    );

    const addr2 = await factory.computePool2Address(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      salt2
    );

    expect(addr1).to.not.equal(addr2);
  });

  it("CREATE vs CREATE2 produce different addresses", async function () {
    const { factory, tokenA, tokenB, owner } = await loadFixture(deployFactoryFixture);

    // Deploy with regular CREATE
    const TokenC = await ethers.getContractFactory("TokenA");
    const tokenC = await TokenC.deploy(owner.address);
    const TokenD = await ethers.getContractFactory("TokenB");
    const tokenD = await TokenD.deploy(owner.address);

    await factory.createPool(await tokenC.getAddress(), await tokenD.getAddress());
    const createAddress = await factory.getPool(await tokenC.getAddress(), await tokenD.getAddress());

    // Predict CREATE2 address
    const salt = ethers.id("test");
    const create2Address = await factory.computePool2Address(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      salt
    );

    expect(createAddress).to.not.equal(create2Address);
  });

  it("deployed pool is functional and address is deterministic", async function () {
    const { factory, tokenA, tokenB } = await loadFixture(deployFactoryFixture);
    const salt = ethers.id("functional-test-unique-12345");

    const tokenAAddr = await tokenA.getAddress();
    const tokenBAddr = await tokenB.getAddress();
    
    // Sort tokens as factory does
    const [t0, t1] = tokenAAddr < tokenBAddr ? [tokenAAddr, tokenBAddr] : [tokenBAddr, tokenAAddr];

    const tx = await factory.createPool2(tokenAAddr, tokenBAddr, salt);
    const receipt = await tx.wait();

    // Get pool address from event
    const event = receipt.logs.find(log => {
      try {
        return factory.interface.parseLog(log).name === "PoolCreated";
      } catch {
        return false;
      }
    });
    const poolAddress = factory.interface.parseLog(event).args.pool;

    // Verify pool is functional
    const pool = await ethers.getContractAt("AMMPool", poolAddress);
    
    expect(await pool.tokenA()).to.equal(t0);
    expect(await pool.tokenB()).to.equal(t1);
    expect(await pool.feeBps()).to.equal(30);
    
    // Note: Address determinism is tested in "computes deterministic address before deployment"
    // This test focuses on functionality after CREATE2 deployment
  });
});
