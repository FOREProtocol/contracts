/* eslint-disable camelcase */
import { expect } from "chai";
import { ethers, upgrades, network } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";

import { BasicFactoryV2 } from "@/BasicFactoryV2";
import { BasicMarketV2 } from "@/BasicMarketV2";
import { ProtocolConfig } from "@/ProtocolConfig";
import { ForeVerifiers } from "@/ForeVerifiers";
import { ForeToken } from "@/ForeToken";
import { ForeProtocol } from "@/ForeProtocol";
import { MockERC20 } from "@/MockERC20";
import { BasicMarketV2__factory } from "@/index";

import {
  attachContract,
  deployLibrary,
  deployMockedContract,
  deployMockedContractAs,
  generateRandomHexString,
  getPreviousBlock,
  toDeadline,
  txExec,
} from "../../helpers/utils";
import {
  MaxAllowanceTransferAmount,
  PERMIT_TYPES,
  PermitSingle,
  SIDES,
  defaultIncentives,
} from "../../helpers/constants";

// Make sure to run `permit2:build` first
import Permit2Artifact from "../../../lib/permit2/out/Permit2.sol/Permit2.json";

describe("Fore Universal Router", function () {
  let owner: SignerWithAddress;
  let foundationWallet: SignerWithAddress;
  let highGuardAccount: SignerWithAddress;
  let marketplaceContract: SignerWithAddress;
  let marketCreator: SignerWithAddress;
  let usdcHolder: SignerWithAddress;
  let alice: SignerWithAddress;

  let MarketFactory: BasicMarketV2__factory;

  let protocolConfig: MockContract<ProtocolConfig>;
  let foreToken: MockContract<ForeToken>;
  let foreVerifiers: MockContract<ForeVerifiers>;
  let foreProtocol: MockContract<ForeProtocol>;
  let basicFactory: MockContract<BasicFactoryV2>;
  let usdcToken: MockERC20;
  let tokenRegistry: Contract;
  let permit2: Contract;
  let contract: Contract;

  let blockTimestamp: number;

  const markets: (BasicMarketV2 | null)[] = new Array(5).fill(null);

  before(async () => {
    await network.provider.send("hardhat_reset");
  });

  beforeEach(async () => {
    [
      owner,
      foundationWallet,
      highGuardAccount,
      marketplaceContract,
      marketCreator,
      alice,
      usdcHolder,
    ] = await ethers.getSigners();

    // deploy library
    const marketlib = await deployLibrary("MarketLibV2", [
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

    // preparing mock usdt token
    usdcToken = await deployMockedContractAs<MockERC20>(
      usdcHolder,
      "MockERC20",
      "USDC",
      "USD Coin",
      ethers.utils.parseEther("1000000")
    );

    // preparing token registry
    const tokenRegistryFactory = await ethers.getContractFactory(
      "TokenIncentiveRegistry"
    );
    tokenRegistry = await upgrades.deployProxy(tokenRegistryFactory, [
      [usdcToken.address, foreToken.address],
      [defaultIncentives, defaultIncentives],
    ]);

    // preparing factory
    basicFactory = await deployMockedContract<BasicFactoryV2>(
      "BasicFactoryV2",
      foreProtocol.address,
      tokenRegistry.address
    );

    // preparing permit2
    const permitFactory = new ethers.ContractFactory(
      Permit2Artifact.abi,
      Permit2Artifact.bytecode,
      owner
    );
    permit2 = await permitFactory.deploy();

    // preparing universal router
    const routerFactory = await ethers.getContractFactory(
      "ForeUniversalRouter"
    );
    contract = await upgrades.deployProxy(routerFactory, [
      foreProtocol.address,
      permit2.address,
      [foreToken.address, usdcToken.address],
    ]);

    await txExec(
      protocolConfig
        .connect(owner)
        .setFactoryStatus([basicFactory.address], [true])
    );

    blockTimestamp = (await getPreviousBlock()).timestamp;

    // Sending funds
    await txExec(
      foreToken
        .connect(owner)
        .transfer(marketCreator.address, ethers.utils.parseEther("1000"))
    );
    await txExec(
      foreToken
        .connect(owner)
        .transfer(alice.address, ethers.utils.parseEther("1000"))
    );

    // Approve tokens
    await txExec(
      foreToken
        .connect(marketCreator)
        .approve(basicFactory.address, ethers.utils.parseUnits("1000", "ether"))
    );

    // Create markets
    MarketFactory = await ethers.getContractFactory("BasicMarketV2", {
      libraries: {
        MarketLibV2: marketlib.address,
      },
    });

    for (let i = 0; i < 5; i++) {
      const hash = generateRandomHexString(64);
      await txExec(
        basicFactory
          .connect(marketCreator)
          .createMarket(
            hash,
            marketCreator.address,
            [0, 0],
            BigNumber.from(blockTimestamp + 200000),
            BigNumber.from(blockTimestamp + 300000),
            foreToken.address
          )
      );
      const initCode = await basicFactory.INIT_CODE_PAIR_HASH();
      const newAddress = ethers.utils.getCreate2Address(
        basicFactory.address,
        hash,
        initCode
      );
      markets[i] = await attachContract<BasicMarketV2>(
        "BasicMarketV2",
        newAddress
      );
    }

    // Approve permit2 contract (one time approval)
    await txExec(
      foreToken
        .connect(alice)
        .approve(permit2.address, ethers.utils.parseEther("1000"))
    );
  });

  describe("initial state", () => {
    it("should return proper router states", async () => {
      expect(await contract.foreProtocol()).to.be.eq(foreProtocol.address);
      expect(await contract.permit2()).to.be.eq(permit2.address);
    });
  });

  describe("permit2", () => {
    let permitSingle: PermitSingle;
    let signature: string;

    beforeEach(async () => {
      permitSingle = {
        details: {
          token: foreToken.address,
          amount: MaxAllowanceTransferAmount,
          expiration: toDeadline(1000 * 60 * 60 * 24 * 30), // 30 days
          nonce: 0,
        },
        spender: contract.address,
        sigDeadline: toDeadline(1000 * 60 * 60 * 30), // 30 minutes
      };

      const domain = {
        name: "Permit2",
        chainId: 31337,
        verifyingContract: permit2.address,
      };

      signature = await alice._signTypedData(
        domain,
        PERMIT_TYPES,
        permitSingle
      );
    });

    describe("market v2 predict", async () => {
      describe("successfully", () => {
        beforeEach(async () => {
          await txExec(contract.connect(alice).permit(permitSingle, signature));
        });

        it("should predict a market", async () => {
          const data = MarketFactory.interface.encodeFunctionData("predict", [
            ethers.utils.parseEther("2"),
            SIDES.TRUE,
          ]);

          await txExec(
            contract
              .connect(alice)
              .callFunction(
                markets[0].address,
                data,
                foreToken.address,
                ethers.utils.parseEther("2")
              )
          );

          expect(await markets[0].marketInfo()).to.be.eql([
            [ethers.utils.parseEther("1.82"), BigNumber.from(0)], // sides
            [BigNumber.from(0), BigNumber.from(0)], // verifications
            ethers.constants.AddressZero, // dispute creator
            ethers.utils.parseEther("1.82"), // total markets size
            BigNumber.from(0), // total verifications amount
            BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
            BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
            0, // result
            0, // winner side index
            false, // confirmed
            false, // solved
          ]);
        });

        it("should predict multiple markets", async () => {
          const data = MarketFactory.interface.encodeFunctionData("predict", [
            ethers.utils.parseEther("2"),
            SIDES.TRUE,
          ]);

          await txExec(
            contract
              .connect(alice)
              .callFunction(
                markets[0].address,
                data,
                foreToken.address,
                ethers.utils.parseEther("2")
              )
          );
          await txExec(
            contract
              .connect(alice)
              .callFunction(
                markets[1].address,
                data,
                foreToken.address,
                ethers.utils.parseEther("2")
              )
          );
          await txExec(
            contract
              .connect(alice)
              .callFunction(
                markets[2].address,
                data,
                foreToken.address,
                ethers.utils.parseEther("2")
              )
          );
        });
      });

      describe("market is not a fore operator ", async () => {
        it("should revert", async () => {
          const data = MarketFactory.interface.encodeFunctionData("predict", [
            ethers.utils.parseEther("2"),
            SIDES.TRUE,
          ]);
          await expect(
            txExec(
              contract
                .connect(alice)
                .callFunction(
                  usdcToken.address,
                  data,
                  foreToken.address,
                  ethers.utils.parseEther("2")
                )
            )
          ).to.be.reverted;
        });
      });
    });
  });
});
