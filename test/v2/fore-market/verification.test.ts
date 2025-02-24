import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract, ContractTransaction } from "ethers";
import { expect } from "chai";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { ForeAccessManager } from "@/ForeAccessManager";
import { BasicMarketV2 } from "@/BasicMarketV2";
import { ForeProtocol } from "@/ForeProtocol";
import { BeaconFactory } from "@/BeaconFactory";
import { MarketLibV2 } from "@/MarketLibV2";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers } from "@/ForeVerifiers";
import { ProtocolConfig } from "@/ProtocolConfig";
import { MockERC20 } from "@/MockERC20";
import { BasicMarket } from "@/BasicMarket";
import { UpgradeableBeacon } from "@/UpgradeableBeacon";

import {
  attachContract,
  deployMockedContract,
  sendERC20Tokens,
  timetravel,
  txExec,
  deployLibrary,
  executeInSingleBlock,
  deployUniversalRouter,
  generateRandomHexString,
  deployContract,
  getBytecode,
} from "../../helpers/utils";
import { SIDES, defaultIncentives } from "../../helpers/constants";

describe("BasicMarketV2 / Verification", () => {
  let owner: SignerWithAddress;
  let foundationWallet: SignerWithAddress;
  let highGuardAccount: SignerWithAddress;
  let marketplaceContract: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;
  let marketLib: MarketLibV2;
  let defaultAdmin: SignerWithAddress;

  let protocolConfig: MockContract<ProtocolConfig>;
  let foreToken: MockContract<ForeToken>;
  let foreVerifiers: MockContract<ForeVerifiers>;
  let foreProtocol: MockContract<ForeProtocol>;
  let beaconFactory: BeaconFactory;
  let tokenRegistry: Contract;
  let accountWhitelist: Contract;
  let usdcToken: MockContract<MockERC20>;
  let contract: BasicMarketV2;
  let foreAccessManager: MockContract<ForeAccessManager>;
  let categoricalMarketBeacon: UpgradeableBeacon;
  let classicMarketBeacon: UpgradeableBeacon;

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
      defaultAdmin,
    ] = await ethers.getSigners();

    // deploy library
    marketLib = await deployLibrary("MarketLibV2", ["BasicMarketV2"]);
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
      ethers.utils.parseEther("35")
    );

    // preparing fore markets (factory)
    foreProtocol = await deployMockedContract<ForeProtocol>(
      "ForeProtocol",
      protocolConfig.address,
      "https://markets.api.foreprotocol.io/market/"
    );

    usdcToken = await deployMockedContract<MockERC20>(
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

    const router = await deployUniversalRouter(
      foreAccessManager.address,
      foreProtocol.address,
      [usdcToken.address, foreToken.address]
    );

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
      router.address
    );

    // factory assignment
    await txExec(foreVerifiers.setProtocol(foreProtocol.address));

    await txExec(
      protocolConfig
        .connect(owner)
        .setFactoryStatus([beaconFactory.address], [true])
    );

    // sending funds
    await sendERC20Tokens(foreToken, {
      [alice.address]: ethers.utils.parseEther("1000"),
      [bob.address]: ethers.utils.parseEther("1000"),
      [carol.address]: ethers.utils.parseEther("1000"),
      [dave.address]: ethers.utils.parseEther("1000"),
    });

    const previousBlock = await ethers.provider.getBlock("latest");
    blockTimestamp = previousBlock.timestamp;

    await txExec(
      protocolConfig
        .connect(owner)
        .setMarketConfig(
          ethers.utils.parseEther("1000"),
          ethers.utils.parseEther("1000"),
          ethers.utils.parseEther("1000"),
          43200,
          43200,
          100,
          100,
          50,
          150
        )
    );
    await txExec(
      foreToken
        .connect(alice)
        .approve(
          beaconFactory.address,
          ethers.utils.parseUnits("1000", "ether")
        )
    );

    // creating market
    const marketHash =
      "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab";
    await txExec(
      beaconFactory
        .connect(alice)
        [
          "createCategoricalMarket(bytes32,address,uint256[],uint64,uint64,address)"
        ](
          marketHash,
          alice.address,
          [0, 0],
          blockTimestamp + 200000,
          blockTimestamp + 300000,
          foreToken.address
        )
    );

    const bytecode = getBytecode(
      await beaconFactory.CATEGORICAL_MARKET_BEACON()
    );
    const initCodeHash = ethers.utils.keccak256(bytecode);
    const newAddress = ethers.utils.getCreate2Address(
      beaconFactory.address,
      marketHash,
      initCodeHash
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

  describe("Both markets sides have prediction", () => {
    beforeEach(async () => {
      await executeInSingleBlock(() => [
        contract
          .connect(alice)
          ["predict(uint256,uint8)"](ethers.utils.parseEther("50"), SIDES.TRUE),
        contract
          .connect(bob)
          ["predict(uint256,uint8)"](
            ethers.utils.parseEther("55"),
            SIDES.FALSE
          ),
      ]);
    });

    describe("initial state", () => {
      it("Should return proper verifications number", async () => {
        expect(await contract.verificationHeight()).to.be.equal(0);
      });

      it("Should revert if executed before prediction end", async () => {
        await timetravel(blockTimestamp + 250000);

        await expect(
          contract.connect(bob).verify(1, SIDES.TRUE)
        ).to.revertedWith("VerificationHasNotStartedYet");
      });
    });

    describe("after verification period start", () => {
      beforeEach(async () => {
        await timetravel(blockTimestamp + 300001);
      });

      it("Should revert if executed with non owned token", async () => {
        await expect(
          contract.connect(bob).verify(0, SIDES.TRUE)
        ).to.revertedWith("BasicMarket: Incorrect owner");
      });

      for (const [sideName, sideValue] of Object.entries(SIDES)) {
        describe(`verifying ${sideName} side`, () => {
          describe(`successfully`, () => {
            let tx: ContractTransaction;

            beforeEach(async () => {
              [tx] = await txExec(contract.connect(bob).verify(1, sideValue));
            });

            it("Should emit Transfer (ERC721) event", async () => {
              await expect(tx)
                .to.emit(foreVerifiers, "Transfer")
                .withArgs(bob.address, contract.address, BigNumber.from(1));
            });

            it("Should emit Verify event", async () => {
              await expect(tx)
                .to.emit({ ...marketLib, address: contract.address }, "Verify")
                .withArgs(
                  bob.address,
                  ethers.utils.parseEther("35"),
                  BigNumber.from(0),
                  BigNumber.from(1),
                  sideValue
                );
            });

            it("Should update state size of verifications", async () => {
              expect(await contract.verificationHeight()).to.be.equal(1);
            });

            it("Should return proper verification state", async () => {
              expect(await contract.verifications(0)).to.be.eql([
                bob.address,
                ethers.utils.parseEther("35"),
                BigNumber.from(1),
                sideValue,
                false,
              ]);
            });

            it("Should update market verification powers", async () => {
              expect(await contract.marketInfo()).to.be.eql([
                [ethers.utils.parseEther("50"), ethers.utils.parseEther("55")], // sides
                [
                  ethers.utils.parseEther(
                    sideValue === SIDES.TRUE ? "35" : "0"
                  ),
                  ethers.utils.parseEther(
                    sideValue === SIDES.TRUE ? "0" : "35"
                  ),
                ], // verifications
                ethers.constants.AddressZero, // dispute creator
                ethers.utils
                  .parseEther("50")
                  .add(ethers.utils.parseEther("55")), // total market size
                ethers.utils
                  .parseEther(sideValue === SIDES.TRUE ? "35" : "0")
                  .add(
                    ethers.utils.parseEther(
                      sideValue === SIDES.TRUE ? "0" : "35"
                    )
                  ), // total verifications amount
                BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                0, // result
                0, // winner side index
                false, // confirmed
                false, // solved
              ]);
            });
          });
        });
      }

      describe("multiple verifications", () => {
        beforeEach(async () => {
          await executeInSingleBlock(() => [
            contract.connect(alice).verify(0, SIDES.FALSE),
            contract.connect(bob).verify(1, SIDES.FALSE),
          ]);
        });

        describe("adding verification to almost fully verified market", () => {
          beforeEach(async () => {
            await txExec(contract.connect(carol).verify(2, SIDES.FALSE));
          });

          it("Should increase verification side with partial token power", async () => {
            expect(await contract.marketInfo()).to.be.eql([
              [ethers.utils.parseEther("50"), ethers.utils.parseEther("55")],
              // sides
              [ethers.utils.parseEther("0"), ethers.utils.parseEther("105")], // verifications
              ethers.constants.AddressZero, // dispute creator
              ethers.utils.parseEther("50").add(ethers.utils.parseEther("55")), // total market size
              ethers.utils.parseEther("105"), // total verifications amount
              BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
              BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
              0, // result
              0, // winner side index
              false, // confirmed
              false, // solved
            ]);
          });

          it("Should return proper power in verification entry", async () => {
            expect(await contract.verifications(2)).to.be.eql([
              carol.address,
              ethers.utils.parseEther("35"),
              BigNumber.from(2),
              SIDES.FALSE,
              false,
            ]);
          });

          it("Should not allow to verify fully verified market", async () => {
            await expect(
              contract.connect(dave).verify(3, SIDES.FALSE)
            ).to.be.revertedWith("MarketIsFullyVerified");
          });
        });
      });
    });

    describe("after verification period end", () => {
      beforeEach(async () => {
        await timetravel(blockTimestamp + 300000 + 43200 + 1);
      });

      it("Should revert trying to verify", async () => {
        await expect(
          contract.connect(bob).verify(1, SIDES.TRUE)
        ).to.revertedWith("VerificationAlreadyClosed");
      });
    });
  });

  describe("Only sideA has prediction (invalid market)", () => {
    beforeEach(async () => {
      await executeInSingleBlock(() => [
        contract
          .connect(alice)
          ["predict(uint256,uint8)"](ethers.utils.parseEther("50"), SIDES.TRUE),
        contract
          .connect(bob)
          ["predict(uint256,uint8)"](ethers.utils.parseEther("55"), SIDES.TRUE),
      ]);
    });

    describe("initial state", () => {
      it("Should return proper verifications number", async () => {
        expect(await contract.verificationHeight()).to.be.equal(0);
      });

      it("Should revert if executed before prediction end", async () => {
        await timetravel(blockTimestamp + 25000);

        await expect(
          contract.connect(bob).verify(1, SIDES.TRUE)
        ).to.revertedWith("VerificationHasNotStartedYet");
      });
    });

    describe("after verification period start", () => {
      beforeEach(async () => {
        await timetravel(blockTimestamp + 300001);
      });

      it("Should revert if executed with non owned token", async () => {
        await expect(
          contract.connect(bob).verify(0, SIDES.TRUE)
        ).to.revertedWith("BasicMarket: Incorrect owner");
      });

      for (const [sideName, sideValue] of Object.entries(SIDES)) {
        describe(`verifying ${sideName} side`, () => {
          describe(`successfully`, () => {
            let tx: ContractTransaction;

            beforeEach(async () => {
              [tx] = await txExec(contract.connect(bob).verify(1, sideValue));
            });

            it("Should emit CloseMarket event with invalid status", async () => {
              await expect(tx)
                .to.emit(
                  { ...marketLib, address: contract.address },
                  "CloseMarket"
                )
                .withArgs(4);
            });

            it("Should have zero state size of verifications", async () => {
              expect(await contract.verificationHeight()).to.be.equal(0);
            });

            it("Should have zero market verification powers", async () => {
              expect(await contract.marketInfo()).to.be.eql([
                [ethers.utils.parseEther("105"), ethers.utils.parseEther("0")], // sides
                [ethers.utils.parseEther("0"), ethers.utils.parseEther("0")], // verifications
                ethers.constants.AddressZero, // dispute creator
                ethers.utils.parseEther("105"), // total market size,
                BigNumber.from(0), // total verifications amount
                BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                4, // result, invalid = 4
                0, // winner side index,
                false, // confirmed
                false, // solved
              ]);
            });
          });
        });
      }
    });
  });

  describe("Only sideB has prediction (invalid market)", () => {
    beforeEach(async () => {
      await executeInSingleBlock(() => [
        contract
          .connect(alice)
          ["predict(uint256,uint8)"](
            ethers.utils.parseEther("50"),
            SIDES.FALSE
          ),
        contract
          .connect(bob)
          ["predict(uint256,uint8)"](
            ethers.utils.parseEther("55"),
            SIDES.FALSE
          ),
      ]);
    });

    describe("initial state", () => {
      it("Should return proper verifications number", async () => {
        expect(await contract.verificationHeight()).to.be.equal(0);
      });

      it("Should revert if executed before prediction end", async () => {
        await timetravel(blockTimestamp + 25000);

        await expect(
          contract.connect(bob).verify(1, SIDES.TRUE)
        ).to.revertedWith("VerificationHasNotStartedYet");
      });
    });

    describe("after verification period start", () => {
      beforeEach(async () => {
        await timetravel(blockTimestamp + 300001);
      });

      it("Should revert if executed with non owned token", async () => {
        await expect(
          contract.connect(bob).verify(0, SIDES.TRUE)
        ).to.revertedWith("BasicMarket: Incorrect owner");
      });

      for (const [sideName, sideValue] of Object.entries(SIDES)) {
        describe(`verifying ${sideName} side`, () => {
          describe(`successfully`, () => {
            let tx: ContractTransaction;

            beforeEach(async () => {
              [tx] = await txExec(contract.connect(bob).verify(1, sideValue));
            });

            it("Should emit CloseMarket event with invalid status", async () => {
              await expect(tx)
                .to.emit(
                  { ...marketLib, address: contract.address },
                  "CloseMarket"
                )
                .withArgs(4);
            });

            it("Should have zero state size of verifications", async () => {
              expect(await contract.verificationHeight()).to.be.equal(0);
            });

            it("Should have zero market verification powers", async () => {
              expect(await contract.marketInfo()).to.be.eql([
                [ethers.utils.parseEther("0"), ethers.utils.parseEther("105")], // sides
                [ethers.utils.parseEther("0"), ethers.utils.parseEther("0")], // verifications
                ethers.constants.AddressZero, // dispute creator
                ethers.utils.parseEther("105"), // total market size
                BigNumber.from(0), // total verifications amount
                BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                4, // result, invalid = 4
                0, // winner side index
                false, // confirmed
                false, // solved
              ]);
            });
          });
        });
      }
    });
  });

  describe("With modified nft multiplier", async () => {
    let contract: BasicMarketV2;
    let tx: ContractTransaction;

    beforeEach(async () => {
      await tokenRegistry
        .connect(defaultAdmin)
        .setTokenIncentives(usdcToken.address, {
          predictionDiscountRate: 1000,
          marketCreatorDiscountRate: 1000,
          verificationDiscountRate: 1000,
          foundationDiscountRate: 1000,
          marketCreationFee: ethers.utils.parseEther("10"),
          verifiersNFTMultiplier: 1000,
        });

      await sendERC20Tokens(usdcToken, {
        [alice.address]: ethers.utils.parseEther("1000"),
        [bob.address]: ethers.utils.parseEther("1000"),
        [carol.address]: ethers.utils.parseEther("1000"),
        [dave.address]: ethers.utils.parseEther("1000"),
      });

      await txExec(
        usdcToken
          .connect(alice)
          .approve(
            beaconFactory.address,
            ethers.utils.parseUnits("1000", "ether")
          )
      );
      await txExec(
        usdcToken
          .connect(bob)
          .approve(
            beaconFactory.address,
            ethers.utils.parseUnits("1000", "ether")
          )
      );
      await txExec(
        usdcToken
          .connect(carol)
          .approve(
            beaconFactory.address,
            ethers.utils.parseUnits("1000", "ether")
          )
      );
      await txExec(
        usdcToken
          .connect(dave)
          .approve(
            beaconFactory.address,
            ethers.utils.parseUnits("1000", "ether")
          )
      );

      const marketHash = generateRandomHexString(64);
      await txExec(
        beaconFactory
          .connect(alice)
          [
            "createCategoricalMarket(bytes32,address,uint256[],uint64,uint64,address)"
          ](
            marketHash,
            alice.address,
            [0, 0],
            blockTimestamp + 200000,
            blockTimestamp + 300000,
            usdcToken.address
          )
      );

      const bytecode = getBytecode(
        await beaconFactory.CATEGORICAL_MARKET_BEACON()
      );
      const initCodeHash = ethers.utils.keccak256(bytecode);
      const newAddress = ethers.utils.getCreate2Address(
        beaconFactory.address,
        marketHash,
        initCodeHash
      );

      contract = await attachContract<BasicMarketV2>(
        "BasicMarketV2",
        newAddress
      );

      await txExec(
        usdcToken
          .connect(alice)
          .approve(contract.address, ethers.utils.parseUnits("1000", "ether"))
      );
      await txExec(
        usdcToken
          .connect(bob)
          .approve(contract.address, ethers.utils.parseUnits("1000", "ether"))
      );
      await txExec(
        usdcToken
          .connect(carol)
          .approve(contract.address, ethers.utils.parseUnits("1000", "ether"))
      );
      await txExec(
        usdcToken
          .connect(dave)
          .approve(contract.address, ethers.utils.parseUnits("1000", "ether"))
      );

      await contract
        .connect(alice)
        ["predict(uint256,uint8)"](ethers.utils.parseEther("50"), SIDES.TRUE);
      await contract
        .connect(bob)
        ["predict(uint256,uint8)"](ethers.utils.parseEther("55"), SIDES.TRUE);
      await contract
        .connect(dave)
        ["predict(uint256,uint8)"](ethers.utils.parseEther("100"), SIDES.TRUE);
      await contract
        .connect(carol)
        ["predict(uint256,uint8)"](ethers.utils.parseEther("30"), SIDES.FALSE);

      await timetravel(blockTimestamp + 300001);

      [tx] = await txExec(contract.connect(bob).verify(1, SIDES.TRUE));
    });

    it("should return modified power", async () => {
      await expect(tx)
        .to.emit({ ...marketLib, address: contract.address }, "Verify")
        .withArgs(
          bob.address,
          ethers.utils.parseEther("3.5"),
          BigNumber.from(0),
          BigNumber.from(1),
          SIDES.TRUE
        );
    });

    it("should return correct reward", async () => {
      await timetravel(blockTimestamp + 4000000);
      await contract.connect(alice).closeMarket();
      expect(
        await contract.calculateVerificationReward(BigNumber.from(0))
      ).to.be.eql([
        ethers.utils.parseEther("4.23"),
        BigNumber.from(0),
        BigNumber.from(0),
        false,
      ]);
    });
  });
});
