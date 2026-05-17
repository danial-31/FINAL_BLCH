const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("TokenAUpgradeable (UUPS)", function () {
  async function deployUpgradeableFixture() {
    const [owner, alice, bob] = await ethers.getSigners();

    const TokenAUpgradeable = await ethers.getContractFactory("TokenAUpgradeable");
    const proxy = await upgrades.deployProxy(TokenAUpgradeable, [owner.address], {
      kind: "uups",
    });
    await proxy.waitForDeployment();

    return { proxy, owner, alice, bob };
  }

  describe("V1 Functionality", function () {
    it("initializes correctly", async function () {
      const { proxy, owner } = await loadFixture(deployUpgradeableFixture);
      expect(await proxy.name()).to.equal("Token Alpha Upgradeable");
      expect(await proxy.symbol()).to.equal("TKAU");
      expect(await proxy.owner()).to.equal(owner.address);
      expect(await proxy.version()).to.equal("1.0.0");
    });

    it("mints initial supply to owner", async function () {
      const { proxy, owner } = await loadFixture(deployUpgradeableFixture);
      expect(await proxy.balanceOf(owner.address)).to.equal(ethers.parseEther("500000"));
    });

    it("owner can mint more tokens", async function () {
      const { proxy, owner, alice } = await loadFixture(deployUpgradeableFixture);
      await proxy.connect(owner).mint(alice.address, ethers.parseEther("1000"));
      expect(await proxy.balanceOf(alice.address)).to.equal(ethers.parseEther("1000"));
    });

    it("reverts mint beyond max supply", async function () {
      const { proxy, owner, alice } = await loadFixture(deployUpgradeableFixture);
      await expect(
        proxy.connect(owner).mint(alice.address, ethers.parseEther("600000"))
      ).to.be.revertedWith("TokenAUpgradeable: max supply exceeded");
    });

    it("non-owner cannot mint", async function () {
      const { proxy, alice } = await loadFixture(deployUpgradeableFixture);
      await expect(
        proxy.connect(alice).mint(alice.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(proxy, "OwnableUnauthorizedAccount");
    });
  });

  describe("Upgrade to V2", function () {
    it("upgrades to V2 successfully", async function () {
      const { proxy, owner } = await loadFixture(deployUpgradeableFixture);

      const TokenAUpgradeableV2 = await ethers.getContractFactory("TokenAUpgradeableV2");
      const upgraded = await upgrades.upgradeProxy(proxy, TokenAUpgradeableV2);

      await upgraded.initializeV2(owner.address);

      expect(await upgraded.version()).to.equal("2.0.0");
      expect(await upgraded.transferFeeBps()).to.equal(100); // 1%
      expect(await upgraded.feeCollector()).to.equal(owner.address);
    });

    it("preserves state after upgrade", async function () {
      const { proxy, owner, alice } = await loadFixture(deployUpgradeableFixture);

      await proxy.connect(owner).mint(alice.address, ethers.parseEther("1000"));
      const balanceBefore = await proxy.balanceOf(alice.address);

      const TokenAUpgradeableV2 = await ethers.getContractFactory("TokenAUpgradeableV2");
      const upgraded = await upgrades.upgradeProxy(proxy, TokenAUpgradeableV2);
      await upgraded.initializeV2(owner.address);

      expect(await upgraded.balanceOf(alice.address)).to.equal(balanceBefore);
      expect(await upgraded.totalSupply()).to.equal(await proxy.totalSupply());
    });

    it("V2 applies transfer fee", async function () {
      const { proxy, owner, alice, bob } = await loadFixture(deployUpgradeableFixture);

      await proxy.connect(owner).mint(alice.address, ethers.parseEther("1000"));

      const TokenAUpgradeableV2 = await ethers.getContractFactory("TokenAUpgradeableV2");
      const upgraded = await upgrades.upgradeProxy(proxy, TokenAUpgradeableV2);
      await upgraded.initializeV2(owner.address);

      const amount = ethers.parseEther("100");
      await upgraded.connect(alice).transfer(bob.address, amount);

      const fee = (amount * 100n) / 10000n; // 1%
      expect(await upgraded.balanceOf(bob.address)).to.equal(amount - fee);
      expect(await upgraded.balanceOf(owner.address)).to.be.gt(ethers.parseEther("500000")); // got fee
    });

    it("owner can update transfer fee", async function () {
      const { proxy, owner } = await loadFixture(deployUpgradeableFixture);

      const TokenAUpgradeableV2 = await ethers.getContractFactory("TokenAUpgradeableV2");
      const upgraded = await upgrades.upgradeProxy(proxy, TokenAUpgradeableV2);
      await upgraded.initializeV2(owner.address);

      await expect(upgraded.connect(owner).setTransferFee(200))
        .to.emit(upgraded, "TransferFeeUpdated")
        .withArgs(100, 200);

      expect(await upgraded.transferFeeBps()).to.equal(200);
    });

    it("reverts if fee too high", async function () {
      const { proxy, owner } = await loadFixture(deployUpgradeableFixture);

      const TokenAUpgradeableV2 = await ethers.getContractFactory("TokenAUpgradeableV2");
      const upgraded = await upgrades.upgradeProxy(proxy, TokenAUpgradeableV2);
      await upgraded.initializeV2(owner.address);

      await expect(upgraded.connect(owner).setTransferFee(501))
        .to.be.revertedWith("TokenAUpgradeableV2: fee too high");
    });

    it("non-owner cannot upgrade", async function () {
      const { proxy, alice } = await loadFixture(deployUpgradeableFixture);

      const TokenAUpgradeableV2 = await ethers.getContractFactory("TokenAUpgradeableV2");
      await expect(
        upgrades.upgradeProxy(proxy, TokenAUpgradeableV2.connect(alice))
      ).to.be.reverted;
    });
  });

  describe("Storage Layout Safety", function () {
    it("V2 does not corrupt V1 storage", async function () {
      const { proxy, owner, alice } = await loadFixture(deployUpgradeableFixture);

      const nameBefore = await proxy.name();
      const symbolBefore = await proxy.symbol();
      const ownerBefore = await proxy.owner();

      const TokenAUpgradeableV2 = await ethers.getContractFactory("TokenAUpgradeableV2");
      const upgraded = await upgrades.upgradeProxy(proxy, TokenAUpgradeableV2);
      await upgraded.initializeV2(owner.address);

      expect(await upgraded.name()).to.equal(nameBefore);
      expect(await upgraded.symbol()).to.equal(symbolBefore);
      expect(await upgraded.owner()).to.equal(ownerBefore);
    });
  });
});
