import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract, ContractTransaction } from "ethers";
import { expect } from "chai";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { BasicMarketV2 } from "@/BasicMarketV2";
import { ForeProtocol } from "@/ForeProtocol";
import { BasicFactoryV2 } from "@/BasicFactoryV2";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers } from "@/ForeVerifiers";
import { ProtocolConfig } from "@/ProtocolConfig";
import { MarketLibV2 } from "@/MarketLibV2";
import { ERC20 } from "@/ERC20";

import {
  attachContract,
  deployLibrary,
  deployMockedContract,
  executeInSingleBlock,
  sendERC20Tokens,
  timetravel,
  txExec,
} from "../../helpers/utils";
import { SIDES, defaultIncentives } from "../../helpers/constants";

describe("BasicMarketV2 / Closing", () => {
  let owner: SignerWithAddress;
  let foundationWallet: SignerWithAddress;

  let highGuardAccount: SignerWithAddress;
  let marketplaceContract: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;
  let marketLib: MarketLibV2;

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
    [
      owner,
      foundationWallet,
      highGuardAccount,
      marketplaceContract,
      alice,
      bob,
      carol,
      dave,
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

    // preparing fore markets (factory)
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
    // factory assignment
    await txExec(foreVerifiers.setProtocol(foreProtocol.address));

    await txExec(
      protocolConfig
        .connect(owner)
        .setFactoryStatus([basicFactory.address], [true])
    );

    // sending funds
    await sendERC20Tokens(foreToken, {
      [alice.address]: ethers.utils.parseEther("2000"),
      [bob.address]: ethers.utils.parseEther("2000"),
      [carol.address]: ethers.utils.parseEther("2000"),
    });

    const previousBlock = await ethers.provider.getBlock("latest");
    blockTimestamp = previousBlock.timestamp;

    await txExec(
      foreToken
        .connect(alice)
        .approve(basicFactory.address, ethers.utils.parseUnits("1000", "ether"))
    );

    // creating market
    const marketHash =
      "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab";

    await txExec(
      basicFactory
        .connect(alice)
        .createMarket(
          marketHash,
          alice.address,
          [ethers.utils.parseEther("70"), ethers.utils.parseEther("30")],
          blockTimestamp + 200000,
          blockTimestamp + 300000,
          foreToken.address
        )
    );

    const initCode = await basicFactory.INIT_CODE_PAIR_HASH();

    const salt = marketHash;
    const newAddress = ethers.utils.getCreate2Address(
      basicFactory.address,
      salt,
      initCode
    );

    contract = await attachContract<BasicMarketV2>("BasicMarketV2", newAddress);
    await executeInSingleBlock(() => [
      foreToken
        .connect(alice)
        .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
      foreToken
        .connect(bob)
        .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
      foreToken
        .connect(carol)
        .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
      foreToken
        .connect(dave)
        .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
    ]);

    // create verifiers tokens
    await executeInSingleBlock(() => [
      foreToken
        .connect(owner)
        .approve(
          foreProtocol.address,
          ethers.utils.parseUnits("1000", "ether")
        ),
      foreProtocol.connect(owner).mintVerifier(alice.address),
      foreProtocol.connect(owner).mintVerifier(bob.address),
      foreProtocol.connect(owner).mintVerifier(carol.address),
      foreProtocol.connect(owner).mintVerifier(dave.address),
    ]);
  });

  describe("initial state", () => {
    it("Should revert if executed before dispute period end", async () => {
      await expect(contract.connect(bob).closeMarket()).to.be.revertedWith(
        "DisputePeriodIsNotEndedYet"
      );
    });
  });

  describe("verified side won (A)", () => {
    beforeEach(async () => {
      await timetravel(blockTimestamp + 300000 + 1);
      await contract.connect(alice).verify(0, SIDES.TRUE);
      await contract.connect(bob).verify(1, SIDES.TRUE);
      await timetravel(blockTimestamp + 300000 + 86400 + 86400 + 1);
    });

    // full market size: 100 FORE
    // to burn (1%) = 1 FORE
    // burn and ver (1% + 1.5%) / 2 = 1.25 FORE
    // revenue (1%) = 1 FORE
    // foundation (1%) = 1 FORE

    describe("successfully", () => {
      let tx: ContractTransaction;

      beforeEach(async () => {
        [tx] = await txExec(contract.connect(bob).closeMarket());
      });

      it("Should emit ERC20 transfer event (foundation)", async () => {
        await expect(tx)
          .to.emit(foreToken, "Transfer")
          .withArgs(
            contract.address,
            foundationWallet.address,
            ethers.utils.parseEther("16.2")
          );
      });

      it("Should emit ERC20 transfer event (burn)", async () => {
        await expect(tx)
          .to.emit(foreToken, "Transfer")
          .withArgs(
            contract.address,
            "0x0000000000000000000000000000000000000000",
            ethers.utils.parseEther("1")
          );
      });

      it("Should emit CloseMarket event", async () => {
        await expect(tx)
          .to.emit({ ...marketLib, address: contract.address }, "CloseMarket")
          .withArgs(2);
      });

      it("Should update market state", async () => {
        expect(await contract.marketInfo()).to.be.eql([
          [ethers.utils.parseEther("70"), ethers.utils.parseEther("30")], // sides
          [ethers.utils.parseEther("40"), ethers.utils.parseEther("0")], // verifications
          ethers.constants.AddressZero, // dispute creator
          ethers.utils.parseEther("70").add(ethers.utils.parseEther("30")), // total market size
          ethers.utils.parseEther("40"), // total verifications amount
          BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
          BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
          2, // result
          0, // winner side index
          false, // confirmed
          false, // solved
        ]);
      });
    });
  });

  describe("verified side won (B)", () => {
    beforeEach(async () => {
      await timetravel(blockTimestamp + 300000 + 1);
      await contract.connect(alice).verify(0, SIDES.FALSE);
      await contract.connect(bob).verify(1, SIDES.FALSE);
      await contract.connect(carol).verify(2, SIDES.FALSE);
      await timetravel(blockTimestamp + 300000 + 86400 + 86400 + 1);
    });

    describe("successfully", () => {
      let tx: ContractTransaction;

      beforeEach(async () => {
        [tx] = await txExec(contract.connect(bob).closeMarket());
      });

      it("Should emit CloseMarket event", async () => {
        await expect(tx)
          .to.emit({ ...marketLib, address: contract.address }, "CloseMarket")
          .withArgs(2);
      });

      it("Should update market state", async () => {
        expect(await contract.marketInfo()).to.be.eql([
          [ethers.utils.parseEther("70"), ethers.utils.parseEther("30")], // sides
          [ethers.utils.parseEther("0"), ethers.utils.parseEther("60")], // verifications
          ethers.constants.AddressZero, // dispute creator
          ethers.utils.parseEther("70").add(ethers.utils.parseEther("30")),
          ethers.utils.parseEther("60"), // total verifications amount
          BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
          BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
          2, // result
          1, // winner side index
          false, // confirmed
          false, // solved
        ]);
      });
    });
  });

  describe("with draw", () => {
    beforeEach(async () => {
      await timetravel(blockTimestamp + 300000 + 1);
      await contract.connect(alice).verify(0, SIDES.TRUE);
      await contract.connect(bob).verify(1, SIDES.FALSE);
      await timetravel(blockTimestamp + 300000 + 86400 + 86400 + 1);
    });

    // full market size: 100 FORE
    // to burn (1%) = 1 FORE
    // burn and ver (1% + 2%) = 3 FORE
    // foundation (1%) = 1 FORE

    describe("successfully", () => {
      let tx: ContractTransaction;

      beforeEach(async () => {
        [tx] = await txExec(contract.connect(bob).closeMarket());
      });

      it("Should emit ERC20 transfer event (foundation)", async () => {
        await expect(tx)
          .to.emit(foreToken, "Transfer")
          .withArgs(
            contract.address,
            foundationWallet.address,
            ethers.utils.parseEther("16.2")
          );
      });

      it("Should emit ERC20 transfer event (burn)", async () => {
        await expect(tx)
          .to.emit(foreToken, "Transfer")
          .withArgs(
            contract.address,
            "0x0000000000000000000000000000000000000000",
            ethers.utils.parseEther("1.9")
          );
      });

      it("Should emit CloseMarket event", async () => {
        await expect(tx)
          .to.emit({ ...marketLib, address: contract.address }, "CloseMarket")
          .withArgs(3);
      });

      it("Should update market state", async () => {
        expect(await contract.marketInfo()).to.be.eql([
          [ethers.utils.parseEther("70"), ethers.utils.parseEther("30")], // sides
          [ethers.utils.parseEther("20"), ethers.utils.parseEther("20")], // verifications
          ethers.constants.AddressZero, // dispute creator
          ethers.utils.parseEther("70").add(ethers.utils.parseEther("30")), // total market size
          ethers.utils.parseEther("20").add(ethers.utils.parseEther("20")), // total verifications amount
          BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
          BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
          3, // result
          0, // winner side index
          false, // confirmed
          false, // solved
        ]);
      });
    });
  });

  describe("with no participants", () => {
    let tx: ContractTransaction;

    beforeEach(async () => {
      await timetravel(blockTimestamp + 300000 + 86400 + 86400 + 1);
      [tx] = await txExec(contract.connect(bob).closeMarket());
    });

    it("Should emit invalid market", async () => {
      await expect(tx)
        .to.emit({ ...marketLib, address: contract.address }, "CloseMarket")
        .withArgs(4);
    });
  });

  describe("with closed market", () => {
    beforeEach(async () => {
      await timetravel(blockTimestamp + 300000 + 86400 + 86400 + 1);
      await txExec(contract.connect(bob).closeMarket());
    });

    it("Should not be possible to close market again", async () => {
      await expect(contract.connect(carol).closeMarket()).to.be.revertedWith(
        "MarketIsClosed"
      );
    });
  });
});
