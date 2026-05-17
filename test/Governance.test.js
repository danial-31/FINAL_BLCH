const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, mine } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Governance", function () {
  async function deployGovernanceFixture() {
    const [owner, alice, bob] = await ethers.getSigners();

    const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    const govToken = await GovernanceToken.deploy(owner.address);

    const DEXTimelock = await ethers.getContractFactory("DEXTimelock");
    const timelock = await DEXTimelock.deploy(
      2 * 24 * 60 * 60, // 2 days
      [],
      [ethers.ZeroAddress],
      owner.address
    );

    const DEXGovernor = await ethers.getContractFactory("DEXGovernor");
    const governor = await DEXGovernor.deploy(
      await govToken.getAddress(),
      await timelock.getAddress()
    );

    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
    await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress());
    await timelock.grantRole(CANCELLER_ROLE, await governor.getAddress());

    // Distribute tokens and delegate
    await govToken.transfer(alice.address, ethers.parseEther("200000"));
    await govToken.connect(alice).delegate(alice.address);
    await govToken.connect(owner).delegate(owner.address);

    return { govToken, timelock, governor, owner, alice, bob };
  }

  describe("DEXGovernor", function () {
    it("has correct name", async function () {
      const { governor } = await loadFixture(deployGovernanceFixture);
      expect(await governor.name()).to.equal("DEX Governor");
    });

    it("has correct voting delay and period", async function () {
      const { governor } = await loadFixture(deployGovernanceFixture);
      expect(await governor.votingDelay()).to.equal(1);
      expect(await governor.votingPeriod()).to.equal(50400);
    });

    it("has correct proposal threshold", async function () {
      const { governor } = await loadFixture(deployGovernanceFixture);
      expect(await governor.proposalThreshold()).to.equal(ethers.parseEther("100000"));
    });

    it("alice can create proposal", async function () {
      const { governor, alice } = await loadFixture(deployGovernanceFixture);
      const targets = [alice.address];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Test proposal";

      await expect(
        governor.connect(alice).propose(targets, values, calldatas, description)
      ).to.emit(governor, "ProposalCreated");
    });

    it("bob cannot create proposal (below threshold)", async function () {
      const { governor, bob } = await loadFixture(deployGovernanceFixture);
      const targets = [bob.address];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Test proposal";

      await expect(
        governor.connect(bob).propose(targets, values, calldatas, description)
      ).to.be.revertedWithCustomError(governor, "GovernorInsufficientProposerVotes");
    });
  });

  describe("Voting", function () {
    it("alice can vote on proposal", async function () {
      const { governor, govToken, alice } = await loadFixture(deployGovernanceFixture);

      const targets = [alice.address];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Test proposal";

      const tx = await governor.connect(alice).propose(targets, values, calldatas, description);
      const receipt = await tx.wait();
      const proposalId = receipt.logs.find(log => log.fragment?.name === "ProposalCreated")?.args[0];

      // Wait for voting delay
      await mine(2);

      // Vote
      await expect(governor.connect(alice).castVote(proposalId, 1))
        .to.emit(governor, "VoteCast");
    });
  });

  describe("DEXTimelock", function () {
    it("has correct min delay", async function () {
      const { timelock } = await loadFixture(deployGovernanceFixture);
      expect(await timelock.getMinDelay()).to.equal(2 * 24 * 60 * 60);
    });

    it("governor has proposer role", async function () {
      const { timelock, governor } = await loadFixture(deployGovernanceFixture);
      const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
      expect(await timelock.hasRole(PROPOSER_ROLE, await governor.getAddress())).to.be.true;
    });
  });
});
