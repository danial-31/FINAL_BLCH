const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MathOptimized (Yul Assembly)", function () {
  let mathLib;

  before(async function () {
    const MathOptimizedWrapper = await ethers.getContractFactory("MathOptimizedWrapper");
    mathLib = await MathOptimizedWrapper.deploy();
  });

  describe("sqrt comparison", function () {
    const testCases = [0, 1, 4, 9, 16, 100, 1000000, ethers.parseEther("1")];

    testCases.forEach(input => {
      it(`sqrt(${input}) produces same result`, async function () {
        const solidityResult = await mathLib.sqrtSolidity(input);
        const yulResult = await mathLib.sqrtYul(input);
        expect(yulResult).to.equal(solidityResult);
      });
    });

    it("Yul sqrt uses less gas", async function () {
      const input = 1000000n;
      const solidityTx = await mathLib.sqrtSolidity.estimateGas(input);
      const yulTx = await mathLib.sqrtYul.estimateGas(input);
      expect(yulTx).to.be.lt(solidityTx);
      console.log(`      Gas savings: ${solidityTx - yulTx} (${((solidityTx - yulTx) * 100n / solidityTx)}%)`);
    });
  });

  describe("mulDiv comparison", function () {
    it("produces same result", async function () {
      const a = ethers.parseEther("1");
      const b = ethers.parseEther("1");
      const c = ethers.parseEther("0.001");
      
      const solidityResult = await mathLib.mulDivSolidity(a, b, c);
      const yulResult = await mathLib.mulDivYul(a, b, c);
      expect(yulResult).to.equal(solidityResult);
    });

    it("Yul mulDiv uses less gas", async function () {
      const a = ethers.parseEther("1");
      const b = ethers.parseEther("1");
      const c = ethers.parseEther("0.001");
      
      const solidityGas = await mathLib.mulDivSolidity.estimateGas(a, b, c);
      const yulGas = await mathLib.mulDivYul.estimateGas(a, b, c);
      expect(yulGas).to.be.lte(solidityGas);
      if (yulGas < solidityGas) {
        console.log(`      Gas savings: ${solidityGas - yulGas} (${((solidityGas - yulGas) * 100n / solidityGas)}%)`);
      }
    });

    it("reverts on division by zero", async function () {
      await expect(mathLib.mulDivYul(100, 200, 0)).to.be.reverted;
    });
  });

  describe("isEven comparison", function () {
    [0, 2, 100, 12345, 99999].forEach(n => {
      it(`isEven(${n}) produces same result`, async function () {
        const solidityResult = await mathLib.isEvenSolidity(n);
        const yulResult = await mathLib.isEvenYul(n);
        expect(yulResult).to.equal(solidityResult);
      });
    });

    it("Yul isEven uses less gas", async function () {
      const solidityGas = await mathLib.isEvenSolidity.estimateGas(12345);
      const yulGas = await mathLib.isEvenYul.estimateGas(12345);
      expect(yulGas).to.be.lte(solidityGas);
      if (yulGas < solidityGas) {
        console.log(`      Gas savings: ${solidityGas - yulGas} (${((solidityGas - yulGas) * 100n / solidityGas)}%)`);
      }
    });
  });

  describe("sumArray comparison", function () {
    it("produces same result for array", async function () {
      const arr = [1, 2, 3, 4, 5, 10, 20, 30];
      const solidityResult = await mathLib.sumArraySolidity(arr);
      const yulResult = await mathLib.sumArrayYul(arr);
      expect(yulResult).to.equal(solidityResult);
    });

    it("Yul sumArray uses less gas", async function () {
      const arr = Array.from({length: 50}, (_, i) => i + 1);
      const solidityGas = await mathLib.sumArraySolidity.estimateGas(arr);
      const yulGas = await mathLib.sumArrayYul.estimateGas(arr);
      expect(yulGas).to.be.lte(solidityGas);
      if (yulGas < solidityGas) {
        console.log(`      Gas savings: ${solidityGas - yulGas} (${((solidityGas - yulGas) * 100n / solidityGas)}%)`);
      }
    });
  });
});
