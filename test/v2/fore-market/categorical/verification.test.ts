import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract, ContractTransaction } from "ethers";
import { expect } from "chai";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { BasicMarketV2 } from "@/BasicMarketV2";
import { ForeProtocol } from "@/ForeProtocol";
import { BasicFactoryV2 } from "@/BasicFactoryV2";
import { MarketLibV2 } from "@/MarketLibV2";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers } from "@/ForeVerifiers";
import { ProtocolConfig } from "@/ProtocolConfig";
import { MockERC20 } from "@/MockERC20";

import {
  attachContract,
  deployMockedContract,
  sendERC20Tokens,
  timetravel,
  txExec,
  deployLibrary,
  executeInSingleBlock,
} from "../../../helpers/utils";
import { SIDES, defaultIncentives } from "../../../helpers/constants";
import { ForeAccessManager } from "@/ForeAccessManager";

describe("BasicMarketV2 / Categorical / Verification", () => {
  let owner: SignerWithAddress;
  let foundationWallet: SignerWithAddress;
  let highGuardAccount: SignerWithAddress;
  let marketplaceContract: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;
  let james: SignerWithAddress;
  let smith: SignerWithAddress;
  let joe: SignerWithAddress;
  let marketLib: MarketLibV2;
  let defaultAdmin: SignerWithAddress;

  let protocolConfig: MockContract<ProtocolConfig>;
  let foreToken: MockContract<ForeToken>;
  let foreVerifiers: MockContract<ForeVerifiers>;
  let foreProtocol: MockContract<ForeProtocol>;
  let basicFactory: MockContract<BasicFactoryV2>;
  let tokenRegistry: Contract;
  let accountWhitelist: Contract;
  let usdcToken: MockContract<MockERC20>;
  let contract: BasicMarketV2;
  let foreAccessManager: MockContract<ForeAccessManager>;

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
      james,
      smith,
      joe,
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

    // preparing factory
    basicFactory = await deployMockedContract<BasicFactoryV2>(
      "BasicFactoryV2",
      foreAccessManager.address,
      foreProtocol.address,
      tokenRegistry.address,
      accountWhitelist.address,
      foundationWallet.address
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
      [alice.address]: ethers.utils.parseEther("1000"),
      [bob.address]: ethers.utils.parseEther("1000"),
      [carol.address]: ethers.utils.parseEther("1000"),
      [dave.address]: ethers.utils.parseEther("1000"),
      [james.address]: ethers.utils.parseEther("1000"),
      [smith.address]: ethers.utils.parseEther("1000"),
      [joe.address]: ethers.utils.parseEther("1000"),
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
          [0, 0, 0, 0, 0],
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
      foreToken
        .connect(james)
        .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
      foreToken
        .connect(smith)
        .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
      foreToken
        .connect(joe)
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
      foreProtocol.connect(owner).mintVerifier(james.address),
      foreProtocol.connect(owner).mintVerifier(smith.address),
      foreProtocol.connect(owner).mintVerifier(joe.address),
    ]);
  });

  describe("All markets sides have prediction", () => {
    beforeEach(async () => {
      await executeInSingleBlock(() => [
        contract.connect(alice).predict(ethers.utils.parseEther("50"), 0),
        contract.connect(alice).predict(ethers.utils.parseEther("40"), 1),
        contract.connect(alice).predict(ethers.utils.parseEther("50"), 2),
        contract.connect(bob).predict(ethers.utils.parseEther("40"), 3),
        contract.connect(bob).predict(ethers.utils.parseEther("50"), 4),
      ]);
    });

    describe("initial state", () => {
      it("Should return proper verifications number", async () => {
        expect(await contract.verificationHeight()).to.be.equal(0);
      });

      it("Should revert if executed before prediction end", async () => {
        await timetravel(blockTimestamp + 250000);

        await expect(contract.connect(bob).verify(1, 0)).to.revertedWith(
          "VerificationHasNotStartedYet"
        );
      });
    });

    describe("after verification period start", () => {
      beforeEach(async () => {
        await timetravel(blockTimestamp + 300001);
      });

      it("Should revert if executed with non owned token", async () => {
        await expect(contract.connect(bob).verify(0, 0)).to.revertedWith(
          "BasicMarket: Incorrect owner"
        );
      });

      for (const side of [0, 1, 2, 3, 4]) {
        describe(`verifying index ${side} side`, () => {
          describe(`successfully`, () => {
            let tx: ContractTransaction;

            beforeEach(async () => {
              [tx] = await txExec(contract.connect(bob).verify(1, side));
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
                  side
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
                side,
                false,
              ]);
            });

            it("Should update market verification powers", async () => {
              const verifications = new Array(5).fill(BigNumber.from(0));
              verifications[side] = ethers.utils.parseEther("35");

              expect(await contract.marketInfo()).to.be.eql([
                [
                  ethers.utils.parseEther("45.5"),
                  ethers.utils.parseEther("36.4"),
                  ethers.utils.parseEther("45.5"),
                  ethers.utils.parseEther("36.4"),
                  ethers.utils.parseEther("45.5"),
                ], // sides
                verifications, // verifications
                ethers.constants.AddressZero, // dispute creator
                ethers.utils.parseEther("209.3"), // total market size
                ethers.utils.parseEther("35"), // total verifications amount
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
            contract.connect(alice).verify(0, 1),
            contract.connect(bob).verify(1, 1),
            contract.connect(carol).verify(2, 1),
            contract.connect(dave).verify(3, 1),
            contract.connect(james).verify(4, 1),
          ]);
        });

        describe("adding verification to almost fully verified market", () => {
          beforeEach(async () => {
            await txExec(contract.connect(smith).verify(5, 1));
          });

          it("Should increase verification side with partial token power", async () => {
            const verifications = new Array(5).fill(BigNumber.from(0));
            verifications[1] = ethers.utils.parseEther("209.3");

            expect(await contract.marketInfo()).to.be.eql([
              [
                ethers.utils.parseEther("45.5"),
                ethers.utils.parseEther("36.4"),
                ethers.utils.parseEther("45.5"),
                ethers.utils.parseEther("36.4"),
                ethers.utils.parseEther("45.5"),
              ], // sides
              verifications, // verifications
              ethers.constants.AddressZero, // dispute creator
              ethers.utils.parseEther("209.3"), // total market size
              ethers.utils.parseEther("209.3"), // total verifications amount
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
              1,
              false,
            ]);
          });

          it("Should not allow to verify fully verified market", async () => {
            await expect(contract.connect(joe).verify(6, 1)).to.be.revertedWith(
              "MarketIsFullyVerified"
            );
          });
        });
      });
    });

    describe("after verification period end", () => {
      beforeEach(async () => {
        await timetravel(blockTimestamp + 300000 + 43200 + 1);
      });

      it("Should revert trying to verify", async () => {
        await expect(contract.connect(bob).verify(1, 0)).to.revertedWith(
          "VerificationAlreadyClosed"
        );
      });
    });
  });

  describe("Only one side has prediction (invalid market)", () => {
    beforeEach(async () => {
      await executeInSingleBlock(() => [
        contract.connect(alice).predict(ethers.utils.parseEther("50"), 0),
        contract.connect(bob).predict(ethers.utils.parseEther("40"), 0),
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
        await expect(contract.connect(bob).verify(0, 0)).to.revertedWith(
          "BasicMarket: Incorrect owner"
        );
      });

      for (const side of [0, 1, 2, 3, 4]) {
        describe(`verifying index ${side} side`, () => {
          describe(`successfully`, () => {
            let tx: ContractTransaction;

            beforeEach(async () => {
              [tx] = await txExec(contract.connect(bob).verify(1, side));
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
                [
                  ethers.utils.parseEther("81.9"),
                  BigNumber.from(0),
                  BigNumber.from(0),
                  BigNumber.from(0),
                  BigNumber.from(0),
                ], // sides
                new Array(5).fill(BigNumber.from(0)), // verifications
                ethers.constants.AddressZero, // dispute creator
                ethers.utils.parseEther("81.9"), // total market size
                BigNumber.from(0), // total verifications amount
                BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                4, // result
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
});
