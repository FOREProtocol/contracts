/* eslint-disable camelcase */
import { ethers, expect, upgrades } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockContract } from "@defi-wonderland/smock";

import { ForeToken } from "@/ForeToken";
import { ForeProtocol } from "@/ForeProtocol";
import { ProtocolConfig } from "@/ProtocolConfig";
import { MockERC20 } from "@/MockERC20";
import { BasicFactoryV2 } from "@/BasicFactoryV2";
import { BasicMarketV2 } from "@/BasicMarketV2";

import {
  attachContract,
  deployLibrary,
  deployMockedContract,
  deployMockedContractAs,
  generateRandomHexString,
  impersonateContract,
  txExec,
} from "../test/helpers/utils";
import {
  defaultIncentives,
  foreProtocolAddress,
  foreTokenAddress,
  protocolConfigAddress,
  protocolConfigOwnerAddress,
  tokenHolderAddress,
} from "../test/helpers/constants";
import { ForeAccessManager } from "@/ForeAccessManager";

describe("Fork / BasicFactoryV2 ", () => {
  let [
    ,
    alice,
    usdcHolder,
    foundationWallet,
    defaultAdmin,
  ]: SignerWithAddress[] = [];

  let foreToken: ForeToken;
  let foreProtocol: ForeProtocol;
  let contract: MockContract<BasicFactoryV2>;
  let market: BasicMarketV2;
  let protocolConfig: ProtocolConfig;
  let usdcToken: MockERC20;
  let tokenRegistry: Contract;
  let foreAccessManager: MockContract<ForeAccessManager>;

  let blockTimestamp: number;

  before(async () => {
    await ethers.provider.send("hardhat_reset", [
      {
        forking: {
          jsonRpcUrl: process.env.ARBITRUM_MAINNET_URL,
          ...(process.env?.FORK_BLOCK_NUMBER && {
            blockNumber: Number(process.env.FORK_BLOCK_NUMBER),
          }),
        },
      },
    ]);
  });

  beforeEach(async () => {
    [, alice, usdcHolder, foundationWallet, defaultAdmin] =
      await ethers.getSigners();

    // deploy library
    await deployLibrary("MarketLibV2", ["BasicMarketV2", "BasicFactoryV2"]);

    foreProtocol = (await ethers.getContractFactory("ForeProtocol")).attach(
      foreProtocolAddress
    );

    usdcToken = await deployMockedContractAs<MockERC20>(
      usdcHolder,
      "MockERC20",
      "USDC",
      "USD Coin",
      ethers.utils.parseEther("1000000")
    );

    foreToken = (await ethers.getContractFactory("ForeToken")).attach(
      foreTokenAddress
    );

    // preparing token registry
    const tokenRegistryFactory = await ethers.getContractFactory(
      "TokenIncentiveRegistry"
    );
    tokenRegistry = await upgrades.deployProxy(tokenRegistryFactory, [
      [usdcToken.address, foreToken.address],
      [defaultIncentives, defaultIncentives],
    ]);

    // setup the access manager
    // preparing fore protocol
    foreAccessManager = await deployMockedContract<ForeAccessManager>(
      "ForeAccessManager",
      defaultAdmin.address
    );

    // preparing factory
    contract = await deployMockedContract<BasicFactoryV2>(
      "BasicFactoryV2",
      foreAccessManager.address,
      foreProtocol.address,
      tokenRegistry.address,
      foundationWallet.address
    );

    // Impersonate token holder
    const impersonatedTokenHolder = await impersonateContract(
      tokenHolderAddress
    );

    // Impersonate protocol config owner
    const impersonatedProtocolConfigOwner = await impersonateContract(
      protocolConfigOwnerAddress
    );

    // Attach protocol config
    protocolConfig = (await ethers.getContractFactory("ProtocolConfig")).attach(
      protocolConfigAddress
    );

    const previousBlock = await ethers.provider.getBlock("latest");
    blockTimestamp = previousBlock.timestamp;

    // Set factory as operator
    await txExec(
      protocolConfig
        .connect(impersonatedProtocolConfigOwner)
        .setFactoryStatus([contract.address], [true])
    );

    // Send fore token to alice
    await foreToken
      .connect(impersonatedTokenHolder)
      .transfer(alice.address, ethers.utils.parseEther("1000"));

    // Approve fore token
    await txExec(
      foreToken
        .connect(alice)
        .approve(contract.address, ethers.utils.parseEther("1000"))
    );
  });

  describe("Initial state", () => {
    it("Should return proper contract states", async () => {
      expect(await contract.foreProtocol()).to.be.eq(foreProtocolAddress);
    });

    it("Should return proper state of fore protocol", async () => {
      expect(await foreProtocol.name()).to.be.eq("Fore Markets");
      expect(await foreProtocol.foreToken()).to.be.eq(foreTokenAddress);
    });

    it("Should return proper state of fore token", async () => {
      expect(await foreToken.name()).to.be.eq("FORE Protocol");
    });
  });

  describe("creating categorical market", async () => {
    beforeEach(async () => {
      const hash = generateRandomHexString(64);
      await txExec(
        contract
          .connect(alice)
          .createMarket(
            hash,
            alice.address,
            new Array(5).fill(0),
            BigNumber.from(blockTimestamp + 200000),
            BigNumber.from(blockTimestamp + 300000),
            foreToken.address
          )
      );

      const initCode = await contract.INIT_CODE_PAIR_HASH();

      const salt = hash;
      const newAddress = ethers.utils.getCreate2Address(
        contract.address,
        salt,
        initCode
      );

      market = await attachContract<BasicMarketV2>("BasicMarketV2", newAddress);
    });

    it("Should return proper market state", async () => {
      expect(await market.marketInfo()).to.be.eql([
        new Array(5).fill(BigNumber.from(0)), // sides
        new Array(5).fill(BigNumber.from(0)), // verifications
        ethers.constants.AddressZero, // dispute creator
        BigNumber.from(0), // total markets size
        BigNumber.from(0), // total verifications amount
        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
        0, // result
        0, // winner side index
        false, // confirmed
        false, // solved
      ]);
    });
  });

  describe("creating USDC denominated market", async () => {
    beforeEach(async () => {
      const hash = generateRandomHexString(64);
      await txExec(
        contract
          .connect(alice)
          .createMarket(
            hash,
            alice.address,
            new Array(5).fill(0),
            BigNumber.from(blockTimestamp + 200000),
            BigNumber.from(blockTimestamp + 300000),
            usdcToken.address
          )
      );

      const initCode = await contract.INIT_CODE_PAIR_HASH();

      const salt = hash;
      const newAddress = ethers.utils.getCreate2Address(
        contract.address,
        salt,
        initCode
      );

      market = await attachContract<BasicMarketV2>("BasicMarketV2", newAddress);
    });

    it("Should return proper market state", async () => {
      expect(await market.marketInfo()).to.be.eql([
        new Array(5).fill(BigNumber.from(0)), // sides
        new Array(5).fill(BigNumber.from(0)), // verifications
        ethers.constants.AddressZero, // dispute creator
        BigNumber.from(0), // total markets size
        BigNumber.from(0), // total verifications amount
        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
        0, // result
        0, // winner side index
        false, // confirmed
        false, // solved
      ]);
      expect(await market.token()).to.be.eql(usdcToken.address);
    });
  });
});
