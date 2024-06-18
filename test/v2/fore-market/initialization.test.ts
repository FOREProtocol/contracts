import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract, ContractTransaction, Signer } from "ethers";
import { expect } from "chai";

import { BasicMarketV2 } from "@/BasicMarketV2";
import { ForeProtocol } from "@/ForeProtocol";
import { BasicFactoryV2 } from "@/BasicFactoryV2";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers } from "@/ForeVerifiers";
import { MarketLib } from "@/MarketLib";
import { ProtocolConfig } from "@/ProtocolConfig";
import { ERC20 } from "@/ERC20";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  assertIsAvailableOnlyForOwner,
  deployContractAs,
  deployLibrary,
  deployMockedContract,
  impersonateContract,
  txExec,
} from "../../helpers/utils";

const defaultIncentives = {
  predictionDiscountRate: 1000,
  marketCreatorDiscountRate: 1000,
  verificationDiscountRate: 1000,
  foundationDiscountRate: 1000,
} as const;

describe("BasicMarketV2 / Initialization", () => {
  let owner: SignerWithAddress;
  let foundationWallet: SignerWithAddress;
  let highGuardAccount: SignerWithAddress;
  let marketplaceContract: SignerWithAddress;
  let basicFactoryAccount: Signer;

  let marketLib: MarketLib;
  let protocolConfig: MockContract<ProtocolConfig>;
  let foreToken: MockContract<ForeToken>;
  let foreVerifiers: MockContract<ForeVerifiers>;
  let foreProtocol: MockContract<ForeProtocol>;
  let basicFactory: MockContract<BasicFactoryV2>;
  let tokenRegistry: Contract;
  let usdcToken: MockContract<ERC20>;
  let contract: BasicMarketV2;

  let blockTimestamp: number;

  beforeEach(async () => {
    [owner, foundationWallet, highGuardAccount, marketplaceContract, , ,] =
      await ethers.getSigners();

    // deploy library
    marketLib = await deployLibrary("MarketLib", [
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

    usdcToken = await deployMockedContract<ERC20>("ERC20", "USDC", "USD Coin");

    // preparing token registry
    const tokenRegistryFactory = await ethers.getContractFactory(
      "TokenIncentiveRegistry"
    );
    tokenRegistry = await upgrades.deployProxy(tokenRegistryFactory, [
      [usdcToken.address, foreToken.address],
      [defaultIncentives, defaultIncentives],
    ]);

    basicFactory = await deployMockedContract<BasicFactoryV2>(
      "BasicFactoryV2",
      foreProtocol.address,
      tokenRegistry.address
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
          amountA: ethers.utils.parseEther("1"),
          amountB: ethers.utils.parseEther("2"),
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
          amountA: ethers.utils.parseEther("1"),
          amountB: ethers.utils.parseEther("2"),
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
        ethers.utils.parseEther("1"), // side A
        ethers.utils.parseEther("2"), // side B
        BigNumber.from(0), // verified A
        BigNumber.from(0), // verified B
        ethers.constants.AddressZero, // dispute creator
        BigNumber.from(blockTimestamp + 100000), // endPredictionTimestamp
        BigNumber.from(blockTimestamp + 200000), // startVerificationTimestamp
        0, // result
        false, // confirmed
        false, // solved
      ]);
    });

    it("Should emit Predict events", async () => {
      await expect(tx)
        .to.emit({ ...marketLib, address: contract.address }, "Predict")
        .withArgs(owner.address, true, ethers.utils.parseEther("1"));

      await expect(tx)
        .to.emit({ ...marketLib, address: contract.address }, "Predict")
        .withArgs(owner.address, false, ethers.utils.parseEther("2"));
    });

    it("Should update predictions state", async () => {
      expect(await contract.predictionsA(owner.address)).to.be.equal(
        ethers.utils.parseEther("1")
      );
      expect(await contract.predictionsB(owner.address)).to.be.equal(
        ethers.utils.parseEther("2")
      );
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
          amountA: 0,
          amountB: ethers.utils.parseEther("2"),
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
        .withArgs(owner.address, false, ethers.utils.parseEther("2"));
    });

    it("Should update predictions state", async () => {
      expect(await contract.predictionsA(owner.address)).to.be.equal(0);
      expect(await contract.predictionsB(owner.address)).to.be.equal(
        ethers.utils.parseEther("2")
      );
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
          amountA: ethers.utils.parseEther("1"),
          amountB: 0,
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
        .withArgs(owner.address, true, ethers.utils.parseEther("1"));
    });

    it("Should update predictions state", async () => {
      expect(await contract.predictionsA(owner.address)).to.be.equal(
        ethers.utils.parseEther("1")
      );
      expect(await contract.predictionsB(owner.address)).to.be.equal(0);
    });
  });
});
