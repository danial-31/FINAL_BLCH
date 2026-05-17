const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // ── 1. Deploy Tokens ──────────────────────────────────────────────────────
  const TokenA = await ethers.getContractFactory("TokenA");
  const tokenA = await TokenA.deploy(deployer.address);
  await tokenA.waitForDeployment();
  console.log("TokenA deployed:", await tokenA.getAddress());

  const TokenB = await ethers.getContractFactory("TokenB");
  const tokenB = await TokenB.deploy(deployer.address);
  await tokenB.waitForDeployment();
  console.log("TokenB deployed:", await tokenB.getAddress());

  const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
  const govToken = await GovernanceToken.deploy(deployer.address);
  await govToken.waitForDeployment();
  console.log("GovernanceToken deployed:", await govToken.getAddress());

  // ── 2. Deploy Factory & Pool ──────────────────────────────────────────────
  const DEXFactory = await ethers.getContractFactory("DEXFactory");
  const factory = await DEXFactory.deploy(deployer.address);
  await factory.waitForDeployment();
  console.log("DEXFactory deployed:", await factory.getAddress());

  const tx = await factory.createPool(await tokenA.getAddress(), await tokenB.getAddress());
  const receipt = await tx.wait();
  const poolAddress = await factory.getPool(await tokenA.getAddress(), await tokenB.getAddress());
  console.log("AMMPool deployed:", poolAddress);

  // ── 3. Deploy Oracle ──────────────────────────────────────────────────────
  const PriceOracle = await ethers.getContractFactory("PriceOracle");
  const oracle = await PriceOracle.deploy(poolAddress, deployer.address);
  await oracle.waitForDeployment();
  console.log("PriceOracle deployed:", await oracle.getAddress());

  // ── 4. Deploy Governance ──────────────────────────────────────────────────
  const DEXTimelock = await ethers.getContractFactory("DEXTimelock");
  const timelock = await DEXTimelock.deploy(
    172800, // 2 days delay
    [],     // proposers set after governor deploy
    [ethers.ZeroAddress], // anyone can execute
    deployer.address
  );
  await timelock.waitForDeployment();
  console.log("DEXTimelock deployed:", await timelock.getAddress());

  const DEXGovernor = await ethers.getContractFactory("DEXGovernor");
  const governor = await DEXGovernor.deploy(
    await govToken.getAddress(),
    await timelock.getAddress()
  );
  await governor.waitForDeployment();
  console.log("DEXGovernor deployed:", await governor.getAddress());

  // ── 5. Setup Timelock roles ───────────────────────────────────────────────
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  const TIMELOCK_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();

  await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress());
  await timelock.grantRole(CANCELLER_ROLE, await governor.getAddress());
  // Renounce admin role from deployer (decentralize)
  await timelock.renounceRole(TIMELOCK_ADMIN_ROLE, deployer.address);
  console.log("Timelock roles configured");

  // ── 6. Transfer pool ownership to timelock ────────────────────────────────
  const pool = await ethers.getContractAt("AMMPool", poolAddress);
  await pool.transferOwnership(await timelock.getAddress());
  console.log("Pool ownership transferred to timelock");

  // ── 7. Add initial liquidity ──────────────────────────────────────────────
  const liquidityA = ethers.parseEther("10000");
  const liquidityB = ethers.parseEther("10000");
  await tokenA.approve(poolAddress, liquidityA);
  await tokenB.approve(poolAddress, liquidityB);
  await pool.addLiquidity(liquidityA, liquidityB, 0, 0);
  console.log("Initial liquidity added: 10,000 TKA / 10,000 TKB");

  // ── 8. Record initial oracle price ───────────────────────────────────────
  await oracle.recordPrice();
  console.log("Initial oracle price recorded");

  // ── Summary ───────────────────────────────────────────────────────────────
  const addresses = {
    tokenA: await tokenA.getAddress(),
    tokenB: await tokenB.getAddress(),
    governanceToken: await govToken.getAddress(),
    factory: await factory.getAddress(),
    pool: poolAddress,
    oracle: await oracle.getAddress(),
    timelock: await timelock.getAddress(),
    governor: await governor.getAddress(),
  };

  console.log("\n=== DEPLOYMENT SUMMARY ===");
  console.log(JSON.stringify(addresses, null, 2));

  // Save addresses to file
  const fs = require("fs");
  fs.writeFileSync(
    "deployments/addresses.json",
    JSON.stringify({ network: hre.network.name, ...addresses }, null, 2)
  );
  console.log("\nAddresses saved to deployments/addresses.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
