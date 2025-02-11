/* eslint-disable camelcase */
import { expect } from "chai";
import { ethers, upgrades, network } from "hardhat";
import { BigNumber, Contract, ContractReceipt } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";

import { BeaconFactory, PausedEvent, UnpausedEvent } from "@/BeaconFactory";
import { BasicMarketV2 } from "@/BasicMarketV2";
import { ProtocolConfig } from "@/ProtocolConfig";
import { ForeVerifiers } from "@/ForeVerifiers";
import { ForeToken } from "@/ForeToken";
import { ForeProtocol } from "@/ForeProtocol";
import { MockERC20 } from "@/MockERC20";
import { ForeUniversalRouter, ManagedTokenEvent } from "@/ForeUniversalRouter";
import {
  BeaconFactory__factory,
  BasicMarketV2__factory,
  ForeAccessManager,
  ForeUniversalRouter__factory,
  BasicMarket,
  UpgradeableBeacon,
} from "@/index";

import {
  assertEvent,
  attachContract,
  deployContract,
  deployLibrary,
  deployMockedContract,
  deployMockedContractAs,
  getBytecode,
  getPreviousBlock,
  impersonateContract,
  timetravel,
  toDeadline,
  txExec,
} from "../../helpers/utils";
import {
  MaxAllowanceTransferAmount,
  PERMIT_TYPES,
  PermitSingle,
  SIDES,
  ZERO_ADDRESS,
  defaultIncentives,
} from "../../helpers/constants";

import Permit2Artifact from "../../abis/Permit2.json";

describe("Fore Universal Router", function () {
  let owner: SignerWithAddress;
  let foundationWallet: SignerWithAddress;
  let highGuardAccount: SignerWithAddress;
  let marketplaceContract: SignerWithAddress;
  let marketCreator: SignerWithAddress;
  let usdcHolder: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let defaultAdmin: SignerWithAddress;
  let sentinelWallet: SignerWithAddress;

  let MarketFactory: BasicMarketV2__factory;
  let RouterFactory: ForeUniversalRouter__factory;
  let BeaconFactory: BeaconFactory__factory;

  let protocolConfig: MockContract<ProtocolConfig>;
  let foreToken: MockContract<ForeToken>;
  let foreVerifiers: MockContract<ForeVerifiers>;
  let foreProtocol: MockContract<ForeProtocol>;
  let beaconFactory: BeaconFactory;
  let usdcToken: MockERC20;
  let tokenRegistry: Contract;
  let accountWhitelist: Contract;
  let permit2: Contract;
  let contract: ForeUniversalRouter;
  let foreAccessManager: MockContract<ForeAccessManager>;
  let categoricalMarketBeacon: UpgradeableBeacon;
  let classicMarketBeacon: UpgradeableBeacon;

  let blockTimestamp: number;
  let domain: Record<string, any>;

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
      bob,
      usdcHolder,
      defaultAdmin,
      sentinelWallet,
    ] = await ethers.getSigners();

    // deploy library
    const marketlib = await deployLibrary("MarketLibV2", ["BasicMarketV2"]);
    await deployLibrary("MarketLib", ["BasicMarket"]);

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

    // preparing account whitelist
    const accountWhitelistFactory = await ethers.getContractFactory(
      "AccountWhitelist"
    );
    accountWhitelist = await upgrades.deployProxy(accountWhitelistFactory, [
      foreAccessManager.address,
      [defaultAdmin.address],
    ]);

    // preparing permit2
    const permitFactory = new ethers.ContractFactory(
      Permit2Artifact.abi,
      Permit2Artifact.bytecode,
      owner
    );
    permit2 = await permitFactory.deploy();

    // preparing universal router
    RouterFactory = await ethers.getContractFactory("ForeUniversalRouter");
    contract = (await upgrades.deployProxy(
      RouterFactory,
      [
        foreAccessManager.address,
        foreProtocol.address,
        permit2.address,
        [foreToken.address, usdcToken.address],
      ],
      {
        kind: "uups",
        initializer: "initialize",
      }
    )) as ForeUniversalRouter;
    await contract.deployed();

    // preparing factory
    const categoricalMarketImpl = await deployContract<BasicMarketV2>(
      "BasicMarketV2"
    );
    const classicMarketImpl = await deployContract<BasicMarket>("BasicMarket");

    categoricalMarketBeacon = await deployContract<UpgradeableBeacon>(
      "UpgradeableBeacon",
      categoricalMarketImpl.address,
      owner.address
    );
    classicMarketBeacon = await deployContract<UpgradeableBeacon>(
      "UpgradeableBeacon",
      classicMarketImpl.address,
      owner.address
    );
    beaconFactory = await deployContract<BeaconFactory>(
      "BeaconFactory",
      foreAccessManager.address,
      categoricalMarketBeacon.address,
      classicMarketBeacon.address,
      foreProtocol.address,
      tokenRegistry.address,
      accountWhitelist.address,
      foundationWallet.address,
      contract.address
    );

    await txExec(
      protocolConfig
        .connect(owner)
        .setFactoryStatus([beaconFactory.address], [true])
    );

    blockTimestamp = (await getPreviousBlock()).timestamp;

    // Sending funds
    await txExec(
      foreToken
        .connect(owner)
        .transfer(alice.address, ethers.utils.parseEther("100000"))
    );
    await txExec(
      foreToken
        .connect(owner)
        .transfer(marketCreator.address, ethers.utils.parseEther("1000"))
    );
    await txExec(
      foreToken
        .connect(owner)
        .transfer(bob.address, ethers.utils.parseEther("1000"))
    );

    // Approve tokens
    await txExec(
      foreToken
        .connect(marketCreator)
        .approve(
          beaconFactory.address,
          ethers.utils.parseUnits("1000", "ether")
        )
    );

    BeaconFactory = await ethers.getContractFactory("BeaconFactory");
    MarketFactory = await ethers.getContractFactory("BasicMarketV2", {
      libraries: {
        MarketLibV2: marketlib.address,
      },
    });

    // Create markets
    for (let i = 0; i < 5; i++) {
      const hash = ethers.utils.formatBytes32String(`test market ${String(i)}`);
      await txExec(
        beaconFactory
          .connect(marketCreator)
          [
            "createCategoricalMarket(bytes32,address,uint256[],uint64,uint64,address)"
          ](
            hash,
            marketCreator.address,
            [0, 0],
            BigNumber.from(blockTimestamp + 200000),
            BigNumber.from(blockTimestamp + 300000),
            foreToken.address
          )
      );
      const bytecode = getBytecode(
        await beaconFactory.CATEGORICAL_MARKET_BEACON()
      );
      const initCodeHash = ethers.utils.keccak256(bytecode);
      const newAddress = ethers.utils.getCreate2Address(
        beaconFactory.address,
        hash,
        initCodeHash
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
        .approve(permit2.address, ethers.utils.parseEther("100000"))
    );

    domain = {
      name: "Permit2",
      chainId: 31337,
      verifyingContract: permit2.address,
    };
  });

  describe("Initialization", async () => {
    it("should not allow re-initialization", async function () {
      await expect(
        contract.initialize(
          foreAccessManager.address,
          foreProtocol.address,
          permit2.address,
          [foreToken.address, usdcToken.address]
        )
      ).to.be.reverted;
    });

    it("should revert invalid authority", async function () {
      await expect(
        upgrades.deployProxy(
          RouterFactory,
          [
            ZERO_ADDRESS,
            foreProtocol.address,
            permit2.address,
            [foreToken.address, usdcToken.address],
          ],
          {
            kind: "uups",
            initializer: "initialize",
          }
        )
      ).to.be.reverted;
    });

    it("should fail router deployment", async () => {
      await expect(
        upgrades.deployProxy(RouterFactory, [
          foreAccessManager.address,
          foreProtocol.address,
          permit2.address,
          [foreToken.address, "0x0000000000000000000000000000000000000000"],
        ])
      ).to.be.reverted;
    });
  });

  describe("Access control", () => {
    let testToken: MockERC20;

    beforeEach(async () => {
      testToken = await deployMockedContractAs<MockERC20>(
        owner,
        "MockERC20",
        "Test",
        "Test Coin",
        ethers.utils.parseEther("1000000")
      );
    });

    describe("No permissions granted, default permissions", () => {
      describe("Default Admin Wallet", () => {
        it("Should allow to use pause", async () => {
          const [, receipt] = await txExec(
            contract.connect(defaultAdmin).pause()
          );
          assertEvent<PausedEvent>(receipt, "Paused");
        });

        it("Should allow to use unpause", async () => {
          await contract.connect(defaultAdmin).pause();
          const [, receipt] = await txExec(
            contract.connect(defaultAdmin).unpause()
          );
          assertEvent<UnpausedEvent>(receipt, "Unpaused");
        });

        it("should add token", async () => {
          const [, receipt] = await txExec(
            contract.connect(defaultAdmin).manageTokens(testToken.address, true)
          );
          assertEvent<ManagedTokenEvent>(receipt, "ManagedToken");
        });
      });

      describe("Deployer Wallet", () => {
        let deployerUnauthorizedMessage: string;

        beforeEach(async () => {
          deployerUnauthorizedMessage = `AccessManagedUnauthorized("${owner.address}")`;
        });

        it("Should revert on pause", async () => {
          await expect(contract.pause()).to.be.revertedWith(
            deployerUnauthorizedMessage
          );
        });

        it("Should revert on unpause", async () => {
          await contract.connect(defaultAdmin).pause();
          await expect(contract.unpause()).to.be.revertedWith(
            deployerUnauthorizedMessage
          );
        });

        it("should revert add token", async () => {
          await expect(
            contract.manageTokens(testToken.address, true)
          ).to.be.revertedWith(deployerUnauthorizedMessage);
        });
      });

      describe("Foundation Wallet", () => {
        let foundationUnauthorizedMessage: string;

        beforeEach(async () => {
          foundationUnauthorizedMessage = `AccessManagedUnauthorized("${foundationWallet.address}")`;
        });

        it("Should revert on pause", async () => {
          await expect(
            contract.connect(foundationWallet).pause()
          ).to.be.revertedWith(foundationUnauthorizedMessage);
        });

        it("Should revert on unpause", async () => {
          // Enable the pause function to test unpause
          await contract.connect(defaultAdmin).pause();

          await expect(
            contract.connect(foundationWallet).unpause()
          ).to.be.revertedWith(foundationUnauthorizedMessage);
        });

        it("Should revert on add token", async () => {
          await expect(
            contract
              .connect(foundationWallet)
              .manageTokens(testToken.address, true)
          ).to.be.revertedWith(foundationUnauthorizedMessage);
        });
      });
    });

    describe("Custom permissions granted, no default permissions", () => {
      const FOUNDATION_ROLE = 1n;
      const SENTINEL_ROLE = 2n;

      beforeEach(async () => {
        await foreAccessManager
          .connect(defaultAdmin)
          .grantRole(FOUNDATION_ROLE, foundationWallet.address, 0);

        await foreAccessManager
          .connect(defaultAdmin)
          .grantRole(SENTINEL_ROLE, sentinelWallet.address, 0);

        // Functions that can only be called by the sentinel
        await foreAccessManager
          .connect(defaultAdmin)
          .setTargetFunctionRole(
            contract.address,
            [
              contract.interface.getSighash("pause"),
              contract.interface.getSighash("unpause"),
            ],
            SENTINEL_ROLE
          );

        await foreAccessManager
          .connect(defaultAdmin)
          .setTargetFunctionRole(
            contract.address,
            [contract.interface.getSighash("manageTokens")],
            FOUNDATION_ROLE
          );
      });

      describe("Default Admin Wallet", () => {
        let defaultAdminUnauthorizedMessage: string;

        beforeEach(async () => {
          defaultAdminUnauthorizedMessage = `AccessManagedUnauthorized("${defaultAdmin.address}")`;
        });

        it("Should revert on pause", async () => {
          await expect(
            contract.connect(defaultAdmin).pause()
          ).to.be.revertedWith(defaultAdminUnauthorizedMessage);
        });

        it("Should revert on unpause", async () => {
          await contract.connect(sentinelWallet).pause();

          await expect(
            contract.connect(defaultAdmin).unpause()
          ).to.be.revertedWith(defaultAdminUnauthorizedMessage);
        });

        it("Should revert on add token", async () => {
          await expect(
            contract.connect(defaultAdmin).manageTokens(testToken.address, true)
          ).to.be.revertedWith(defaultAdminUnauthorizedMessage);
        });
      });

      describe("Deployer Wallet", () => {
        let deployerUnauthorizedMessage: string;

        beforeEach(async () => {
          deployerUnauthorizedMessage = `AccessManagedUnauthorized("${owner.address}")`;
        });

        it("Should revert on pause", async () => {
          await expect(contract.pause()).to.be.revertedWith(
            deployerUnauthorizedMessage
          );
        });

        it("Should revert on unpause", async () => {
          await contract.connect(sentinelWallet).pause();

          await expect(contract.unpause()).to.be.revertedWith(
            deployerUnauthorizedMessage
          );
        });

        it("Should revert on add token", async () => {
          await expect(
            contract.manageTokens(testToken.address, true)
          ).to.be.revertedWith(deployerUnauthorizedMessage);
        });
      });

      describe("Sentinel Wallet", () => {
        let sentinelUnauthorizedMessage: string;

        beforeEach(async () => {
          sentinelUnauthorizedMessage = `AccessManagedUnauthorized("${sentinelWallet.address}")`;
        });

        it("Should allow to use pause", async () => {
          const [, receipt] = await txExec(
            contract.connect(sentinelWallet).pause()
          );
          assertEvent<PausedEvent>(receipt, "Paused");
        });

        it("Should allow to use unpause", async () => {
          await txExec(contract.connect(sentinelWallet).pause());

          const [, receipt] = await txExec(
            contract.connect(sentinelWallet).unpause()
          );

          assertEvent<UnpausedEvent>(receipt, "Unpaused");
        });

        it("Should revert add token", async () => {
          await expect(
            contract
              .connect(sentinelWallet)
              .manageTokens(testToken.address, true)
          ).to.be.revertedWith(sentinelUnauthorizedMessage);
        });
      });

      describe("Foundation Wallet", () => {
        let foundationUnauthorizedMessage: string;

        beforeEach(async () => {
          foundationUnauthorizedMessage = `AccessManagedUnauthorized("${foundationWallet.address}")`;
        });

        it("Should revert on pause", async () => {
          await expect(
            contract.connect(foundationWallet).pause()
          ).to.be.revertedWith(foundationUnauthorizedMessage);
        });

        it("Should revert on unpause", async () => {
          await contract.connect(sentinelWallet).pause();

          await expect(
            contract.connect(foundationWallet).unpause()
          ).to.be.revertedWith(foundationUnauthorizedMessage);
        });

        it("Should allow to add token", async () => {
          const [, receipt] = await txExec(
            contract
              .connect(foundationWallet)
              .manageTokens(testToken.address, true)
          );

          assertEvent<ManagedTokenEvent>(receipt, "ManagedToken");
        });
      });
    });
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

      signature = await alice._signTypedData(
        domain,
        PERMIT_TYPES,
        permitSingle
      );
    });

    describe("market v2 predict", async () => {
      describe("successfully", () => {
        beforeEach(async () => {
          const data = MarketFactory.interface.encodeFunctionData(
            "predict(address,uint256,uint8)",
            [alice.address, ethers.utils.parseEther("2"), SIDES.TRUE]
          );

          await txExec(
            contract
              .connect(alice)
              .permitCallFunction(
                permitSingle,
                signature,
                markets[0].address,
                data,
                foreToken.address,
                ethers.utils.parseEther("2")
              )
          );
        });

        it("should update market info", async () => {
          expect(await markets[0].marketInfo()).to.be.eql([
            [ethers.utils.parseEther("2"), BigNumber.from(0)], // sides
            [BigNumber.from(0), BigNumber.from(0)], // verifications
            ethers.constants.AddressZero, // dispute creator
            ethers.utils.parseEther("2"), // total markets size
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

      describe("permit then call", () => {
        beforeEach(async () => {
          await txExec(contract.connect(alice).permit(permitSingle, signature));
        });

        it("should call function", async () => {
          const data = MarketFactory.interface.encodeFunctionData(
            "predict(address,uint256,uint8)",
            [alice.address, ethers.utils.parseEther("2"), SIDES.TRUE]
          );

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
            [ethers.utils.parseEther("2"), BigNumber.from(0)], // sides
            [BigNumber.from(0), BigNumber.from(0)], // verifications
            ethers.constants.AddressZero, // dispute creator
            ethers.utils.parseEther("2"), // total markets size
            BigNumber.from(0), // total verifications amount
            BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
            BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
            0, // result
            0, // winner side index
            false, // confirmed
            false, // solved
          ]);
        });

        it("should still proceed if the router already has allowance to the market", async () => {
          const impersonate = await impersonateContract(contract.address);
          await foreToken
            .connect(impersonate)
            .approve(markets[0].address, ethers.utils.parseEther("2"));

          const data = MarketFactory.interface.encodeFunctionData(
            "predict(address,uint256,uint8)",
            [alice.address, ethers.utils.parseEther("2"), SIDES.TRUE]
          );
          await contract
            .connect(alice)
            .callFunction(
              markets[0].address,
              data,
              foreToken.address,
              ethers.utils.parseEther("2")
            );
        });
      });

      describe("with invalid token or target", async () => {
        it("should revert `callFunction` if token is invalid", async () => {
          const data = MarketFactory.interface.encodeFunctionData(
            "predict(address,uint256,uint8)",
            [alice.address, ethers.utils.parseEther("2"), SIDES.TRUE]
          );

          await expect(
            contract
              .connect(alice)
              .callFunction(
                markets[0].address,
                data,
                ZERO_ADDRESS,
                ethers.utils.parseEther("2")
              )
          ).to.be.reverted;
        });

        it("should revert `callFunction` if target is invalid", async () => {
          const data = MarketFactory.interface.encodeFunctionData(
            "predict(address,uint256,uint8)",
            [alice.address, ethers.utils.parseEther("2"), SIDES.TRUE]
          );

          await expect(
            contract
              .connect(alice)
              .callFunction(
                ZERO_ADDRESS,
                data,
                foreToken.address,
                ethers.utils.parseEther("2")
              )
          ).to.be.reverted;
        });

        it("should revert `permitCallFunction` if token is invalid", async () => {
          const data = MarketFactory.interface.encodeFunctionData(
            "predict(address,uint256,uint8)",
            [alice.address, ethers.utils.parseEther("2"), SIDES.TRUE]
          );

          await expect(
            contract
              .connect(alice)
              .permitCallFunction(
                permitSingle,
                signature,
                markets[0].address,
                data,
                ZERO_ADDRESS,
                ethers.utils.parseEther("2")
              )
          ).to.be.reverted;
        });

        it("should revert `permitCallFunction` if target is invalid", async () => {
          const data = MarketFactory.interface.encodeFunctionData(
            "predict(address,uint256,uint8)",
            [alice.address, ethers.utils.parseEther("2"), SIDES.TRUE]
          );

          await expect(
            contract
              .connect(alice)
              .permitCallFunction(
                permitSingle,
                signature,
                ZERO_ADDRESS,
                data,
                foreToken.address,
                ethers.utils.parseEther("2")
              )
          ).to.be.reverted;
        });
      });

      describe("with predict multiple markets", () => {
        beforeEach(async () => {
          const data = MarketFactory.interface.encodeFunctionData(
            "predict(address,uint256,uint8)",
            [alice.address, ethers.utils.parseEther("2"), SIDES.TRUE]
          );

          await txExec(
            contract
              .connect(alice)
              .permitCallFunction(
                permitSingle,
                signature,
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

        it("should update all markets", async () => {
          const expectedMarketInfo = [
            [ethers.utils.parseEther("2"), BigNumber.from(0)], // sides
            [BigNumber.from(0), BigNumber.from(0)], // verifications
            ethers.constants.AddressZero, // dispute creator
            ethers.utils.parseEther("2"), // total markets size
            BigNumber.from(0), // total verifications amount
            BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
            BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
            0, // result
            0, // winner side index
            false, // confirmed
            false, // solved
          ];

          expect(await markets[0].marketInfo()).to.be.eql(expectedMarketInfo);
          expect(await markets[1].marketInfo()).to.be.eql(expectedMarketInfo);
          expect(await markets[2].marketInfo()).to.be.eql(expectedMarketInfo);

          expect(
            await markets[0].getPredictionAmountBySide(
              alice.address,
              SIDES.TRUE
            )
          ).to.be.eq(ethers.utils.parseEther("2"));
          expect(
            await markets[1].getPredictionAmountBySide(
              alice.address,
              SIDES.TRUE
            )
          ).to.be.eq(ethers.utils.parseEther("2"));
          expect(
            await markets[2].getPredictionAmountBySide(
              alice.address,
              SIDES.TRUE
            )
          ).to.be.eq(ethers.utils.parseEther("2"));
        });
      });

      describe("target contract is not a FORE operator", async () => {
        let data: string;

        beforeEach(() => {
          data = MarketFactory.interface.encodeFunctionData(
            "predict(address,uint256,uint8)",
            [alice.address, ethers.utils.parseEther("2"), SIDES.TRUE]
          );
        });

        it("should revert call function", async () => {
          await expect(
            txExec(
              contract
                .connect(alice)
                .callFunction(
                  "0x1f2EF540b840358f56Fe46984777917CEDC43eD7",
                  data,
                  foreToken.address,
                  ethers.utils.parseEther("2")
                )
            )
          ).to.be.reverted;
        });

        it("should revert permit call function", async () => {
          const data = MarketFactory.interface.encodeFunctionData(
            "predict(address,uint256,uint8)",
            [alice.address, ethers.utils.parseEther("2"), SIDES.TRUE]
          );

          await expect(
            txExec(
              contract
                .connect(alice)
                .permitCallFunction(
                  permitSingle,
                  signature,
                  "0x1f2EF540b840358f56Fe46984777917CEDC43eD7",
                  data,
                  foreToken.address,
                  ethers.utils.parseEther("2")
                )
            )
          ).to.be.reverted;
        });

        it("should revert when target address is 0", async () => {
          await expect(
            txExec(
              contract
                .connect(alice)
                .callFunction(
                  "0x0000000000000000000000000000000000000000",
                  data,
                  foreToken.address,
                  ethers.utils.parseEther("2")
                )
            )
          ).to.be.reverted;
        });
      });

      describe("external call failed", () => {
        let data: string;

        beforeEach(() => {
          data = MarketFactory.interface.encodeFunctionData(
            "predict(address,uint256,uint8)",
            [alice.address, ethers.utils.parseEther("2"), SIDES.TRUE]
          );
        });

        it("should revert permit call", async () => {
          await expect(
            txExec(
              contract
                .connect(alice)
                .permitCallFunction(
                  permitSingle,
                  signature,
                  markets[0].address,
                  data,
                  foreToken.address,
                  ethers.utils.parseEther("0")
                )
            )
          ).to.be.reverted;
        });

        it("should revert call", async () => {
          await txExec(contract.connect(alice).permit(permitSingle, signature));
          await expect(
            txExec(
              contract
                .connect(alice)
                .callFunction(
                  markets[0].address,
                  data,
                  foreToken.address,
                  BigNumber.from(0)
                )
            )
          ).to.be.reverted;
        });
      });

      describe("permit single is invalid", () => {
        let data: string = "";
        let mockPermitSingle: typeof permitSingle | null = null;

        beforeEach(() => {
          data = MarketFactory.interface.encodeFunctionData(
            "predict(address,uint256,uint8)",
            [alice.address, ethers.utils.parseEther("2"), SIDES.TRUE]
          );
          mockPermitSingle = {
            details: {
              ...permitSingle.details,
            },
            ...permitSingle,
          };
        });

        it("should revert invalid token", async () => {
          mockPermitSingle.details.token =
            "0x0000000000000000000000000000000000000000";
          await expect(
            txExec(
              contract
                .connect(alice)
                .permitCallFunction(
                  mockPermitSingle,
                  signature,
                  markets[0].address,
                  data,
                  foreToken.address,
                  ethers.utils.parseEther("2")
                )
            )
          ).to.be.reverted;
        });

        it("should revert invalid spender", async () => {
          mockPermitSingle.spender =
            "0x0000000000000000000000000000000000000000";
          await expect(
            txExec(
              contract
                .connect(alice)
                .permitCallFunction(
                  mockPermitSingle,
                  signature,
                  markets[0].address,
                  data,
                  foreToken.address,
                  ethers.utils.parseEther("2")
                )
            )
          ).to.be.reverted;
        });

        it("should revert invalid sender", async () => {
          await expect(
            contract
              .connect(bob)
              .permitCallFunction(
                permitSingle,
                signature,
                markets[0].address,
                data,
                foreToken.address,
                ethers.utils.parseEther("2")
              )
          ).to.be.reverted;
        });
      });
    });

    describe("create categorical market", async () => {
      let hash: string;
      let data: string;

      describe("successfully", () => {
        beforeEach(async () => {
          hash = ethers.utils.formatBytes32String("test mHash");
          blockTimestamp = (await getPreviousBlock()).timestamp;

          data = BeaconFactory.interface.encodeFunctionData(
            "createCategoricalMarket(bytes32,address,address,uint256[],uint64,uint64,address)",
            [
              hash,
              alice.address,
              alice.address,
              [0, 0],
              BigNumber.from(blockTimestamp + 200000),
              BigNumber.from(blockTimestamp + 300000),
              foreToken.address,
            ]
          );

          await txExec(
            contract
              .connect(alice)
              .permitCallFunction(
                permitSingle,
                signature,
                beaconFactory.address,
                data,
                foreToken.address,
                ethers.utils.parseEther("10")
              )
          );
        });

        it("should have market address", async () => {
          const marketAddress = await foreProtocol.market(hash);
          expect(await foreProtocol.isForeMarket(marketAddress)).to.be.true;
        });

        it("should revert invalid sender", async () => {
          await expect(
            contract
              .connect(bob)
              .permitCallFunction(
                permitSingle,
                signature,
                beaconFactory.address,
                data,
                foreToken.address,
                ethers.utils.parseEther("10")
              )
          ).to.be.reverted;
        });
      });
    });

    describe("create classic market", async () => {
      let hash: string;
      let data: string;

      describe("successfully", () => {
        beforeEach(async () => {
          hash = ethers.utils.formatBytes32String("test mHash");
          blockTimestamp = (await getPreviousBlock()).timestamp;

          data = BeaconFactory.interface.encodeFunctionData(
            "createClassicMarket(bytes32,address,address,uint256,uint256,uint64,uint64)",
            [
              hash,
              alice.address,
              alice.address,
              0n,
              0n,
              BigNumber.from(blockTimestamp + 200000),
              BigNumber.from(blockTimestamp + 300000),
            ]
          );

          await txExec(
            contract
              .connect(alice)
              .permitCallFunction(
                permitSingle,
                signature,
                beaconFactory.address,
                data,
                foreToken.address,
                ethers.utils.parseEther("10")
              )
          );
        });

        it("should have market address", async () => {
          const marketAddress = await foreProtocol.market(hash);
          expect(await foreProtocol.isForeMarket(marketAddress)).to.be.true;
        });

        it("should revert invalid sender", async () => {
          await expect(
            contract
              .connect(bob)
              .permitCallFunction(
                permitSingle,
                signature,
                beaconFactory.address,
                data,
                foreToken.address,
                ethers.utils.parseEther("10")
              )
          ).to.be.reverted;
        });
      });
    });

    describe("emergency stops", async () => {
      let data: string = "";
      let receipt: ContractReceipt;

      describe("paused contract", () => {
        beforeEach(async () => {
          data = MarketFactory.interface.encodeFunctionData(
            "predict(address,uint256,uint8)",
            [alice.address, ethers.utils.parseEther("2"), SIDES.TRUE]
          );
          [, receipt] = await txExec(contract.connect(defaultAdmin).pause());
        });

        it("should emit pause event", async () => {
          assertEvent<PausedEvent>(receipt, "Paused");
        });

        it("should revert with pause error (permitCallFunction)", async () => {
          await expect(
            txExec(
              contract
                .connect(alice)
                .permitCallFunction(
                  permitSingle,
                  signature,
                  markets[0].address,
                  data,
                  foreToken.address,
                  ethers.utils.parseEther("0")
                )
            )
          ).to.revertedWith("EnforcedPause()");
        });

        it("should revert with pause error (permit)", async () => {
          await expect(
            txExec(contract.connect(alice).permit(permitSingle, signature))
          ).to.revertedWith("EnforcedPause()");
        });

        it("should revert with pause error (callFunction)", async () => {
          await expect(
            txExec(
              contract
                .connect(alice)
                .callFunction(
                  markets[0].address,
                  data,
                  foreToken.address,
                  ethers.utils.parseEther("0")
                )
            )
          ).to.revertedWith("EnforcedPause()");
        });
      });

      describe("paused target contract", async () => {
        beforeEach(async () => {
          await beaconFactory.connect(defaultAdmin).pause();
        });

        it("should revert call function failed for categorical market", async () => {
          const hash = ethers.utils.formatBytes32String("test mHash");
          blockTimestamp = (await getPreviousBlock()).timestamp;

          data = BeaconFactory.interface.encodeFunctionData(
            "createCategoricalMarket(bytes32,address,address,uint256[],uint64,uint64,address)",
            [
              hash,
              alice.address,
              alice.address,
              [0, 0],
              BigNumber.from(blockTimestamp + 200000),
              BigNumber.from(blockTimestamp + 300000),
              foreToken.address,
            ]
          );

          await expect(
            contract
              .connect(alice)
              .permitCallFunction(
                permitSingle,
                signature,
                beaconFactory.address,
                data,
                foreToken.address,
                ethers.utils.parseEther("10")
              )
          ).to.be.reverted;
        });

        it("should revert call function failed for classic market", async () => {
          const hash = ethers.utils.formatBytes32String("test mHash");
          blockTimestamp = (await getPreviousBlock()).timestamp;

          data = BeaconFactory.interface.encodeFunctionData(
            "createClassicMarket(bytes32,address,address,uint256,uint256,uint64,uint64)",
            [
              hash,
              alice.address,
              alice.address,
              0n,
              0n,
              BigNumber.from(blockTimestamp + 200000),
              BigNumber.from(blockTimestamp + 300000),
            ]
          );

          await expect(
            contract
              .connect(alice)
              .permitCallFunction(
                permitSingle,
                signature,
                beaconFactory.address,
                data,
                foreToken.address,
                ethers.utils.parseEther("10")
              )
          ).to.be.reverted;
        });
      });

      describe("unpaused contract", () => {
        let receipt: ContractReceipt;

        beforeEach(async () => {
          await txExec(contract.connect(defaultAdmin).pause());
          [, receipt] = await txExec(contract.connect(defaultAdmin).unpause());

          data = MarketFactory.interface.encodeFunctionData(
            "predict(address,uint256,uint8)",
            [alice.address, ethers.utils.parseEther("2"), SIDES.TRUE]
          );
        });

        it("should emit unpaused event", async () => {
          assertEvent<UnpausedEvent>(receipt, "Unpaused");
        });

        it("should allow to use function (permitCallFunction)", async () => {
          await txExec(
            contract
              .connect(alice)
              .permitCallFunction(
                permitSingle,
                signature,
                markets[0].address,
                data,
                foreToken.address,
                ethers.utils.parseEther("2")
              )
          );
        });

        it("should allow to use function (permit)", async () => {
          await txExec(contract.connect(alice).permit(permitSingle, signature));
        });

        it("should allow to use function (callFunction)", async () => {
          await txExec(contract.connect(alice).permit(permitSingle, signature));
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
        });
      });

      describe("unpaused target contract", async () => {
        beforeEach(async () => {
          await beaconFactory.connect(defaultAdmin).pause();
          await beaconFactory.connect(defaultAdmin).unpause();
        });

        it("should create categorical market", async () => {
          const hash = ethers.utils.formatBytes32String("test mHash");
          blockTimestamp = (await getPreviousBlock()).timestamp;

          data = BeaconFactory.interface.encodeFunctionData(
            "createCategoricalMarket(bytes32,address,address,uint256[],uint64,uint64,address)",
            [
              hash,
              alice.address,
              alice.address,
              [0, 0],
              BigNumber.from(blockTimestamp + 200000),
              BigNumber.from(blockTimestamp + 300000),
              foreToken.address,
            ]
          );

          await contract
            .connect(alice)
            .permitCallFunction(
              permitSingle,
              signature,
              beaconFactory.address,
              data,
              foreToken.address,
              ethers.utils.parseEther("10")
            );
        });

        it("should create classic market", async () => {
          const hash = ethers.utils.formatBytes32String("test mHash");
          blockTimestamp = (await getPreviousBlock()).timestamp;

          data = BeaconFactory.interface.encodeFunctionData(
            "createClassicMarket(bytes32,address,address,uint256,uint256,uint64,uint64)",
            [
              hash,
              alice.address,
              alice.address,
              0n,
              0n,
              BigNumber.from(blockTimestamp + 200000),
              BigNumber.from(blockTimestamp + 300000),
            ]
          );

          await contract
            .connect(alice)
            .permitCallFunction(
              permitSingle,
              signature,
              beaconFactory.address,
              data,
              foreToken.address,
              ethers.utils.parseEther("10")
            );
        });
      });
    });

    describe("open dispute", async () => {
      let data: string;

      beforeEach(async () => {
        await txExec(
          foreToken
            .connect(bob)
            .approve(
              markets[0].address,
              ethers.utils.parseUnits("1000", "ether")
            )
        );
        await foreToken
          .connect(owner)
          .approve(
            foreProtocol.address,
            ethers.utils.parseUnits("1000", "ether")
          );
        await txExec(foreVerifiers.setProtocol(foreProtocol.address));
        await foreProtocol.connect(owner).mintVerifier(bob.address);

        await markets[0]
          .connect(bob)
          ["predict(uint256,uint8)"](ethers.utils.parseEther("5"), SIDES.TRUE);
        await markets[0]
          .connect(bob)
          ["predict(uint256,uint8)"](ethers.utils.parseEther("2"), SIDES.FALSE);

        await timetravel(blockTimestamp + 300000 + 1);
        await markets[0].connect(bob).verify(0, SIDES.FALSE);

        await timetravel(blockTimestamp + 300000 + 86400 + 1);
        data = MarketFactory.interface.encodeFunctionData(
          "openDispute(address,bytes32)",
          [
            alice.address,
            "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
          ]
        );

        permitSingle.sigDeadline = (await getPreviousBlock()).timestamp + 1800;
        signature = await alice._signTypedData(
          domain,
          PERMIT_TYPES,
          permitSingle
        );
      });

      it("should successfully dispute", async () => {
        await txExec(
          contract
            .connect(alice)
            .permitCallFunction(
              permitSingle,
              signature,
              markets[0].address,
              data,
              foreToken.address,
              ethers.utils.parseEther("1000")
            )
        );
        expect((await markets[0].marketInfo()).disputeCreator).to.be.eq(
          alice.address
        );
      });

      it("should revert invalid sender", async () => {
        await expect(
          contract
            .connect(bob)
            .permitCallFunction(
              permitSingle,
              signature,
              markets[0].address,
              data,
              foreToken.address,
              ethers.utils.parseEther("1000")
            )
        ).to.be.reverted;
      });
    });

    describe("allowed selector management", async () => {
      it("should allow to add selector", async () => {
        const bytes4Value = ethers.utils.hexDataSlice(
          ethers.utils.keccak256(
            ethers.utils.toUtf8Bytes("transfer(address,uint256)")
          ),
          0,
          4
        );
        await contract
          .connect(defaultAdmin)
          .manageAllowedFunctions(bytes4Value, true);
      });

      it("should revert invalid selector", async () => {
        const data = BeaconFactory.interface.encodeFunctionData(
          "setPredictionFlatFeeRate(uint32 feeRate)",
          [100]
        );

        await expect(
          contract
            .connect(alice)
            .permitCallFunction(
              permitSingle,
              signature,
              beaconFactory.address,
              data,
              foreToken.address,
              ethers.utils.parseEther("10")
            )
        ).to.be.reverted;
      });

      it("should revert not admin", async () => {
        const bytes4Value = ethers.utils.hexDataSlice(
          ethers.utils.keccak256(
            ethers.utils.toUtf8Bytes("transfer(address,uint256)")
          ),
          0,
          4
        );
        await expect(
          contract.connect(alice).manageAllowedFunctions(bytes4Value, true)
        ).to.be.reverted;
      });
    });
  });

  describe("token management", () => {
    let testToken: MockERC20;
    let receipt: ContractReceipt;

    beforeEach(async () => {
      testToken = await deployMockedContractAs<MockERC20>(
        owner,
        "MockERC20",
        "Test",
        "Test Coin",
        ethers.utils.parseEther("1000000")
      );
    });

    describe("successfully add token", () => {
      beforeEach(async () => {
        [, receipt] = await txExec(
          contract.connect(defaultAdmin).manageTokens(testToken.address, true)
        );
      });

      it("should emit event", () => {
        assertEvent<ManagedTokenEvent>(receipt, "ManagedToken", {
          token: testToken.address,
          shouldAdd: true,
        });
      });

      it("should add token", async () => {
        expect(await contract.tokens(testToken.address)).to.true;
      });
    });

    describe("successfully removed token", async () => {
      beforeEach(async () => {
        [, receipt] = await txExec(
          contract.connect(defaultAdmin).manageTokens(testToken.address, false)
        );
      });

      it("should emit event", () => {
        assertEvent<ManagedTokenEvent>(receipt, "ManagedToken", {
          token: testToken.address,
          shouldAdd: false,
        });
      });

      it("should remove token", async () => {
        expect(await contract.tokens(testToken.address)).to.false;
      });
    });

    it("should revert invalid token", async () => {
      await expect(
        contract
          .connect(defaultAdmin)
          .manageTokens("0x0000000000000000000000000000000000000000", true)
      ).to.be.reverted;
    });
  });

  describe("authorize upgrade", () => {
    it("should revert unauthorized upgrade", async () => {
      const deployerUnauthorizedMessage = `AccessManagedUnauthorized("${owner.address}")`;
      const RouterImplV2 = await ethers.getContractFactory(
        "ForeUniversalRouter"
      );
      await expect(
        upgrades.upgradeProxy(contract.address, RouterImplV2, {
          kind: "uups",
          call: {
            fn: "pause",
            args: [],
          },
        })
      ).to.revertedWith(deployerUnauthorizedMessage);
    });

    it("should authorize upgrade", async () => {
      const RouterImplV2 = await ethers.getContractFactory(
        "ForeUniversalRouter",
        defaultAdmin
      );
      await upgrades.upgradeProxy(contract.address, RouterImplV2, {
        kind: "uups",
        call: {
          fn: "pause",
          args: [],
        },
      });
    });
  });
});
