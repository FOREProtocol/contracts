import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract, ContractTransaction, Signer } from "ethers";
import { expect } from "chai";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { BasicMarketV2 } from "@/BasicMarketV2";
import { ForeProtocol } from "@/ForeProtocol";
import { BasicFactoryV2 } from "@/BasicFactoryV2";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers } from "@/ForeVerifiers";
import { MarketLibV2 } from "@/MarketLibV2";
import { ProtocolConfig } from "@/ProtocolConfig";
import { ERC20 } from "@/ERC20";

import {
  assertIsAvailableOnlyForOwner,
  deployContractAs,
  deployLibrary,
  deployMockedContract,
  impersonateContract,
  timetravel,
  txExec,
} from "../../helpers/utils";
import { SIDES, defaultIncentives } from "../../helpers/constants";
import { ForeAccessManager } from "@/ForeAccessManager";

describe("BasicMarketV2 / Initialization", () => {
  let owner: SignerWithAddress;
  let foundationWallet: SignerWithAddress;
  let highGuardAccount: SignerWithAddress;
  let marketplaceContract: SignerWithAddress;
  let basicFactoryAccount: Signer;
  let defaultAdmin: SignerWithAddress;

  let marketLib: MarketLibV2;
  let protocolConfig: MockContract<ProtocolConfig>;
  let foreToken: MockContract<ForeToken>;
  let foreVerifiers: MockContract<ForeVerifiers>;
  let foreProtocol: MockContract<ForeProtocol>;
  let basicFactory: MockContract<BasicFactoryV2>;
  let tokenRegistry: Contract;
  let usdcToken: MockContract<ERC20>;
  let contract: BasicMarketV2;
  let foreAccessManager: MockContract<ForeAccessManager>;

  let blockTimestamp: number;

  beforeEach(async () => {
    [
      owner,
      foundationWallet,
      highGuardAccount,
      marketplaceContract,
      ,
      ,
      defaultAdmin,
    ] = await ethers.getSigners();

    // deploy library
    marketLib = await deployLibrary("MarketLibV2", [
      "BasicMarketV2",
      "BasicFactoryV2",
    ]);

    // preparing dependencies
    foreToken = await deployMockedContract<ForeToken>("ForeToken");
    foreVerifiers = await deployMockedContract<ForeVerifiers>(
      "ForeVerifiers",
      "https://test.com/"
    );

    protocolConfig = await deployMockedContract<ProtocolConfig>(
      "ProtocolConfig",
      foundationWallet.address,
      highGuardAccount.address,
      marketplaceContract.address,
      foreToken.address,
      foreVerifiers.address,
      ethers.utils.parseEther("10"),
      ethers.utils.parseEther("20")
    );

    // preparing fore protocol
    foreProtocol = await deployMockedContract<ForeProtocol>(
      "ForeProtocol",
      protocolConfig.address,
      "https://markets.api.foreprotocol.io/market/"
    );

    usdcToken = await deployMockedContract<ERC20>(
      "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
      "USDC",
      "USD Coin"
    );

    // setup the access manager
    // preparing fore protocol
    foreAccessManager = await deployMockedContract<ForeAccessManager>(
      "ForeAccessManager",
      defaultAdmin.address
    );

    // preparing token registry
    const tokenRegistryFactory = await ethers.getContractFactory(
      "TokenIncentiveRegistry"
    );
    tokenRegistry = await upgrades.deployProxy(tokenRegistryFactory, [
      foreAccessManager.address,
      [usdcToken.address, foreToken.address],
      [defaultIncentives, defaultIncentives],
    ]);

    // preparing factory
    basicFactory = await deployMockedContract<BasicFactoryV2>(
      "BasicFactoryV2",
      foreAccessManager.address,
      foreProtocol.address,
      tokenRegistry.address,
      foundationWallet.address
    );
    basicFactoryAccount = await impersonateContract(basicFactory.address);

    // factory assignment
    await txExec(foreVerifiers.setProtocol(foreProtocol.address));

    // deployment of market using factory account
    contract = await deployContractAs<BasicMarketV2>(
      basicFactoryAccount,
      "BasicMarketV2"
    );

    const previousBlock = await ethers.provider.getBlock("latest");
    blockTimestamp = previousBlock.timestamp;
  });

  it("Should allow to execute only by fore markets", async () => {
    await assertIsAvailableOnlyForOwner(
      async (account) => {
        return contract.connect(account).initialize({
          mHash:
            "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
          receiver: owner.address,
          amounts: [ethers.utils.parseEther("1"), ethers.utils.parseEther("2")],
          protocolAddress: foreProtocol.address,
          tokenRegistry: tokenRegistry.address,
          feeReceiver: owner.address,
          token: foreToken.address,
          endPredictionTimestamp: blockTimestamp + 100000,
          startVerificationTimestamp: blockTimestamp + 200000,
          tokenId: 0,
          predictionFlatFeeRate: 1000,
          marketCreatorFlatFeeRate: 100,
          verificationFlatFeeRate: 100,
          foundationFlatFeeRate: 1800,
        });
      },
      basicFactoryAccount,
      "BasicMarket: Only Factory"
    );
  });

  describe("successfully", () => {
    let tx: ContractTransaction;

    beforeEach(async () => {
      [tx] = await txExec(
        contract.connect(basicFactoryAccount).initialize({
          mHash:
            "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
          receiver: owner.address,
          amounts: [ethers.utils.parseEther("1"), ethers.utils.parseEther("2")],
          protocolAddress: foreProtocol.address,
          tokenRegistry: tokenRegistry.address,
          feeReceiver: owner.address,
          token: foreToken.address,
          endPredictionTimestamp: blockTimestamp + 100000,
          startVerificationTimestamp: blockTimestamp + 200000,
          tokenId: 0,
          predictionFlatFeeRate: 1000,
          marketCreatorFlatFeeRate: 100,
          verificationFlatFeeRate: 100,
          foundationFlatFeeRate: 1800,
        })
      );
    });

    it("Should emit MarketInitialized event", async () => {
      await expect(tx)
        .to.emit(
          { ...marketLib, address: contract.address },
          "MarketInitialized"
        )
        .withArgs(BigNumber.from(0));
    });

    it("Should return proper protocol config address", async () => {
      expect(await contract.protocolConfig()).to.be.equal(
        protocolConfig.address
      );
    });

    it("Should return proper market config address", async () => {
      expect(await contract.marketConfig()).to.be.equal(
        await protocolConfig.marketConfig()
      );
    });

    it("Should return proper FORE verifiers address", async () => {
      expect(await contract.foreVerifiers()).to.be.equal(foreVerifiers.address);
    });

    it("Should return proper FORE token address", async () => {
      expect(await contract.foreToken()).to.be.equal(foreToken.address);
    });

    it("Should return proper market hash", async () => {
      expect(await contract.marketHash()).to.be.equal(
        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab"
      );
    });

    it("Should return proper market struct", async () => {
      expect(await contract.marketInfo()).to.be.eql([
        [ethers.utils.parseEther("1"), ethers.utils.parseEther("2")], // sides
        [BigNumber.from(0), BigNumber.from(0)], // verifications
        ethers.constants.AddressZero, // dispute creator
        ethers.utils.parseEther("1").add(ethers.utils.parseEther("2")), // total market size
        BigNumber.from(0),
        BigNumber.from(blockTimestamp + 100000), // endPredictionTimestamp
        BigNumber.from(blockTimestamp + 200000), // startVerificationTimestamp
        0, // result
        0, // winner side index
        false, // confirmed
        false, // solved
      ]);
    });

    it("Should emit Predict events", async () => {
      await expect(tx)
        .to.emit({ ...marketLib, address: contract.address }, "Predict")
        .withArgs(owner.address, SIDES.TRUE, ethers.utils.parseEther("1"));

      await expect(tx)
        .to.emit({ ...marketLib, address: contract.address }, "Predict")
        .withArgs(owner.address, SIDES.FALSE, ethers.utils.parseEther("2"));
    });

    it("Should update predictions state", async () => {
      expect(
        await contract.getPredictionAmountBySide(owner.address, SIDES.TRUE)
      ).to.be.equal(ethers.utils.parseEther("1"));
      expect(
        await contract.getPredictionAmountBySide(owner.address, SIDES.FALSE)
      ).to.be.equal(ethers.utils.parseEther("2"));
    });

    it("Should return initial verificationHeight", async () => {
      expect(await contract.verificationHeight()).to.be.equal(0);
    });
  });

  describe("with 0 A side", () => {
    let tx: ContractTransaction;

    beforeEach(async () => {
      [tx] = await txExec(
        contract.connect(basicFactoryAccount).initialize({
          mHash:
            "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
          receiver: owner.address,
          amounts: [0, ethers.utils.parseEther("2")],
          protocolAddress: foreProtocol.address,
          tokenRegistry: tokenRegistry.address,
          feeReceiver: owner.address,
          token: foreToken.address,
          endPredictionTimestamp: blockTimestamp + 100000,
          startVerificationTimestamp: blockTimestamp + 200000,
          tokenId: 0,
          predictionFlatFeeRate: 1000,
          marketCreatorFlatFeeRate: 100,
          verificationFlatFeeRate: 100,
          foundationFlatFeeRate: 1800,
        })
      );
    });

    it("Should emit Predict events", async () => {
      await expect(tx)
        .to.emit({ ...marketLib, address: contract.address }, "Predict")
        .withArgs(owner.address, SIDES.FALSE, ethers.utils.parseEther("2"));
    });

    it("Should update predictions state", async () => {
      expect(
        await contract.getPredictionAmountBySide(owner.address, SIDES.TRUE)
      ).to.be.equal(0);
      expect(
        await contract.getPredictionAmountBySide(owner.address, SIDES.FALSE)
      ).to.be.equal(ethers.utils.parseEther("2"));
    });
  });

  describe("with 0 B side", () => {
    let tx: ContractTransaction;

    beforeEach(async () => {
      [tx] = await txExec(
        contract.connect(basicFactoryAccount).initialize({
          mHash:
            "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
          receiver: owner.address,
          amounts: [ethers.utils.parseEther("1"), 0],
          protocolAddress: foreProtocol.address,
          tokenRegistry: tokenRegistry.address,
          feeReceiver: owner.address,
          token: foreToken.address,
          endPredictionTimestamp: blockTimestamp + 100000,
          startVerificationTimestamp: blockTimestamp + 200000,
          tokenId: 0,
          predictionFlatFeeRate: 1000,
          marketCreatorFlatFeeRate: 100,
          verificationFlatFeeRate: 100,
          foundationFlatFeeRate: 1800,
        })
      );
    });

    it("Should emit Predict events", async () => {
      await expect(tx)
        .to.emit({ ...marketLib, address: contract.address }, "Predict")
        .withArgs(owner.address, SIDES.TRUE, ethers.utils.parseEther("1"));
    });

    it("Should update predictions state", async () => {
      expect(
        await contract.getPredictionAmountBySide(owner.address, SIDES.TRUE)
      ).to.be.equal(ethers.utils.parseEther("1"));
      expect(
        await contract.getPredictionAmountBySide(owner.address, SIDES.FALSE)
      ).to.be.equal(0);
    });
  });

  it("should revert prediction period is already closed", async () => {
    await timetravel(blockTimestamp + 100001);

    await expect(
      txExec(
        contract.connect(basicFactoryAccount).initialize({
          mHash:
            "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
          receiver: owner.address,
          amounts: [ethers.utils.parseEther("1"), ethers.utils.parseEther("2")],
          protocolAddress: foreProtocol.address,
          tokenRegistry: tokenRegistry.address,
          feeReceiver: owner.address,
          token: foreToken.address,
          endPredictionTimestamp: blockTimestamp + 100000,
          startVerificationTimestamp: blockTimestamp + 200000,
          tokenId: 0,
          predictionFlatFeeRate: 1000,
          marketCreatorFlatFeeRate: 100,
          verificationFlatFeeRate: 100,
          foundationFlatFeeRate: 1800,
        })
      )
    ).to.revertedWith("PredictionPeriodIsAlreadyClosed");
  });
});
