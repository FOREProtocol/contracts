import { ERC20 } from "@/ERC20";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { deployContract } from "../../helpers/utils";

const defaultIncentives = {
  predictionDiscountRate: 1000,
  marketCreatorDiscountRate: 1000,
  verificationDiscountRate: 1000,
  foundationDiscountRate: 1000,
} as const;

describe("Token Incentive Registry", function () {
  let contract: Contract;
  let [usdcToken, token1, token2, token3, token4]: ERC20[] = [];

  beforeEach(async () => {
    usdcToken = await deployContract("ERC20", "USDC", "USDC");
    token1 = await deployContract("ERC20", "Token1", "Token1");
    token2 = await deployContract("ERC20", "Token2", "Token2");
    token3 = await deployContract("ERC20", "Token3", "Token3");
    token4 = await deployContract("ERC20", "Token4", "Token4");

    usdcToken.deployed();
    token1.deployed();
    token2.deployed();
    token3.deployed();

    const contractFactory = await ethers.getContractFactory(
      "TokenIncentiveRegistry"
    );
    contract = await upgrades.deployProxy(contractFactory, [
      [usdcToken.address],
      [defaultIncentives],
    ]);
  });

  describe("Initial values", () => {
    it("should add initial tokens", async () => {
      expect(await contract.isTokenEnabled(usdcToken.address)).to.eql(true);
      expect(await contract.getTokenIncentives(usdcToken.address)).to.eql([
        BigNumber.from(1000),
        BigNumber.from(1000),
        BigNumber.from(1000),
        BigNumber.from(1000),
      ]);
    });
  });

  describe("Registry", () => {
    describe("Add token", () => {
      beforeEach(async () => {
        await contract.addToken(token1.address, defaultIncentives);
        await contract.addToken(token2.address, defaultIncentives);
        await contract.addToken(token3.address, defaultIncentives);
      });

      it("successfully", async () => {
        expect(await contract.isTokenEnabled(token1.address)).to.eq(true);
        expect(await contract.isTokenEnabled(token2.address)).to.eq(true);
        expect(await contract.isTokenEnabled(token3.address)).to.eq(true);
      });

      it("should set discount rate", async () => {
        expect(await contract.getTokenIncentives(token1.address)).to.eql([
          BigNumber.from(1000),
          BigNumber.from(1000),
          BigNumber.from(1000),
          BigNumber.from(1000),
        ]);
        expect(await contract.getTokenIncentives(token2.address)).to.eql([
          BigNumber.from(1000),
          BigNumber.from(1000),
          BigNumber.from(1000),
          BigNumber.from(1000),
        ]);
        expect(await contract.getTokenIncentives(token3.address)).to.eql([
          BigNumber.from(1000),
          BigNumber.from(1000),
          BigNumber.from(1000),
          BigNumber.from(1000),
        ]);
      });

      it("should revert when adding a token that has already been added", async () => {
        await expect(contract.addToken(token1.address, defaultIncentives)).to.be
          .reverted;
        await expect(contract.addToken(token2.address, defaultIncentives)).to.be
          .reverted;
      });

      it("should revert when adding a token with all incentive rates are zeroes", async () => {
        const incentives = {
          predictionDiscountRate: 0,
          marketCreatorDiscountRate: 0,
          verificationDiscountRate: 0,
          foundationDiscountRate: 0,
        };
        await expect(contract.addToken(token4.address, incentives)).to.be
          .reverted;
      });
    });

    describe("Remove token", () => {
      beforeEach(async () => {
        await contract.addToken(token1.address, defaultIncentives);
        await contract.addToken(token2.address, defaultIncentives);
        await contract.addToken(token3.address, defaultIncentives);

        await contract.removeToken(token1.address);
        await contract.removeToken(token2.address);
        await contract.removeToken(token3.address);
      });

      it("successfully", async () => {
        expect(await contract.isTokenEnabled(token1.address)).to.eq(false);
        expect(await contract.isTokenEnabled(token2.address)).to.eq(false);
        expect(await contract.isTokenEnabled(token3.address)).to.eq(false);
      });

      it("should all incentive rates are set to 0", async () => {
        expect(await contract.getTokenIncentives(token1.address)).to.eql([
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
        ]);
        expect(await contract.getTokenIncentives(token2.address)).to.eql([
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
        ]);
        expect(await contract.getTokenIncentives(token3.address)).to.eql([
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
        ]);
      });

      it("should revert when removing an unregistered token", async () => {
        await expect(contract.removeToken(token4.address)).to.be.reverted;
      });

      it("should able to add token again", async () => {
        expect(await contract.addToken(token1.address, defaultIncentives));
        expect(await contract.isTokenEnabled(token1.address)).to.eq(true);
      });
    });

    describe("Set incentives", () => {
      beforeEach(async () => {
        const incentives = {
          predictionDiscountRate: 100,
          marketCreatorDiscountRate: 100,
          verificationDiscountRate: 100,
          foundationDiscountRate: 100,
        };
        await contract.addToken(token1.address, incentives);
        await contract.addToken(token2.address, incentives);
        await contract.addToken(token3.address, incentives);

        await contract.setTokenIncentives(token1.address, defaultIncentives);
        await contract.setTokenIncentives(token2.address, defaultIncentives);
        await contract.setTokenIncentives(token3.address, defaultIncentives);
      });

      it("should set discount rate", async () => {
        expect(await contract.getTokenIncentives(token1.address)).to.be.eql([
          BigNumber.from(1000),
          BigNumber.from(1000),
          BigNumber.from(1000),
          BigNumber.from(1000),
        ]);
        expect(await contract.getTokenIncentives(token2.address)).to.be.eql([
          BigNumber.from(1000),
          BigNumber.from(1000),
          BigNumber.from(1000),
          BigNumber.from(1000),
        ]);
        expect(await contract.getTokenIncentives(token3.address)).to.be.eql([
          BigNumber.from(1000),
          BigNumber.from(1000),
          BigNumber.from(1000),
          BigNumber.from(1000),
        ]);
      });
    });
  });
});
