const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Tokens", function () {
  async function deployTokensFixture() {
    const [owner, alice, bob] = await ethers.getSigners();
    const TokenA = await ethers.getContractFactory("TokenA");
    const TokenB = await ethers.getContractFactory("TokenB");
    const GovernanceToken = await ethers.getContractFactory("GovernanceToken");

    const tokenA = await TokenA.deploy(owner.address);
    const tokenB = await TokenB.deploy(owner.address);
    const govToken = await GovernanceToken.deploy(owner.address);

    return { tokenA, tokenB, govToken, owner, alice, bob };
  }

  describe("TokenA", function () {
    it("has correct name and symbol", async function () {
      const { tokenA } = await loadFixture(deployTokensFixture);
      expect(await tokenA.name()).to.equal("Token Alpha");
      expect(await tokenA.symbol()).to.equal("TKA");
    });

    it("mints initial supply to owner", async function () {
      const { tokenA, owner } = await loadFixture(deployTokensFixture);
      expect(await tokenA.balanceOf(owner.address)).to.equal(ethers.parseEther("500000"));
    });

    it("owner can mint more tokens", async function () {
      const { tokenA, owner, alice } = await loadFixture(deployTokensFixture);
      await tokenA.connect(owner).mint(alice.address, ethers.parseEther("1000"));
      expect(await tokenA.balanceOf(alice.address)).to.equal(ethers.parseEther("1000"));
    });

    it("reverts mint beyond max supply", async function () {
      const { tokenA, owner, alice } = await loadFixture(deployTokensFixture);
      await expect(
        tokenA.connect(owner).mint(alice.address, ethers.parseEther("600000"))
      ).to.be.revertedWith("TokenA: max supply exceeded");
    });

    it("non-owner cannot mint", async function () {
      const { tokenA, alice } = await loadFixture(deployTokensFixture);
      await expect(
        tokenA.connect(alice).mint(alice.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(tokenA, "OwnableUnauthorizedAccount");
    });

    it("owner can burn tokens", async function () {
      const { tokenA, owner } = await loadFixture(deployTokensFixture);
      const before = await tokenA.balanceOf(owner.address);
      await tokenA.connect(owner).burn(ethers.parseEther("1000"));
      expect(await tokenA.balanceOf(owner.address)).to.equal(before - ethers.parseEther("1000"));
    });
  });

  describe("TokenB", function () {
    it("has correct name and symbol", async function () {
      const { tokenB } = await loadFixture(deployTokensFixture);
      expect(await tokenB.name()).to.equal("Token Beta");
      expect(await tokenB.symbol()).to.equal("TKB");
    });

    it("mints initial supply to owner", async function () {
      const { tokenB, owner } = await loadFixture(deployTokensFixture);
      expect(await tokenB.balanceOf(owner.address)).to.equal(ethers.parseEther("500000"));
    });
  });

  describe("GovernanceToken", function () {
    it("has correct name and symbol", async function () {
      const { govToken } = await loadFixture(deployTokensFixture);
      expect(await govToken.name()).to.equal("DEX Governance Token");
      expect(await govToken.symbol()).to.equal("DGT");
    });

    it("supports ERC20Votes delegation", async function () {
      const { govToken, owner, alice } = await loadFixture(deployTokensFixture);
      await govToken.connect(owner).delegate(alice.address);
      const votes = await govToken.getVotes(alice.address);
      expect(votes).to.be.gt(0);
    });

    it("reverts mint beyond max supply", async function () {
      const { govToken, owner, alice } = await loadFixture(deployTokensFixture);
      await expect(
        govToken.connect(owner).mint(alice.address, ethers.parseEther("10000000"))
      ).to.be.revertedWith("GovernanceToken: max supply exceeded");
    });
  });
});
