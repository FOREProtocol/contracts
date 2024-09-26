import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract, ContractTransaction } from "ethers";
import { expect } from "chai";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { ForeAccessManager } from "@/ForeAccessManager";
import { BasicMarketV2 } from "@/BasicMarketV2";
import { ForeProtocol } from "@/ForeProtocol";
import { BasicFactoryV2 } from "@/BasicFactoryV2";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers } from "@/ForeVerifiers";
import { ProtocolConfig } from "@/ProtocolConfig";
import { MarketLibV2 } from "@/MarketLibV2";
import { MockERC20 } from "@/MockERC20";

import {
  attachContract,
  deployLibrary,
  deployMockedContract,
  executeInSingleBlock,
  sendERC20Tokens,
  timetravel,
  txExec,
  assertIsAvailableOnlyForOwner,
  generateRandomHexString,
  deployUniversalRouter,
} from "../../../helpers/utils";
import { defaultIncentives } from "../../../helpers/constants";

const calculateMarketCreatorFeeRate = async (contract: BasicMarketV2) => {
  const flatRate = await contract.marketCreatorFlatFeeRate();
  const discountRate =
    flatRate * (defaultIncentives.marketCreatorDiscountRate / 10000);
  return flatRate - discountRate;
};

describe("BasicMarketV2 / Categorical / Rewards", () => {
  let owner: SignerWithAddress;
  let foundationWallet: SignerWithAddress;
  let highGuardAccount: SignerWithAddress;
  let marketplaceContract: SignerWithAddress;
  let predictorSideA1: SignerWithAddress;
  let predictorSideA2: SignerWithAddress;
  let predictorSideB1: SignerWithAddress;
  let predictorSideB2: SignerWithAddress;
  let verifierSideA1: SignerWithAddress;
  let verifierSideA2: SignerWithAddress;
  let verifierSideB1: SignerWithAddress;
  let verifierSideB2: SignerWithAddress;
  let marketCreator: SignerWithAddress;
  let marketLib: MarketLibV2;
  let disputeCreator: SignerWithAddress;
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
      predictorSideA1,
      predictorSideA2,
      predictorSideB1,
      predictorSideB2,
      verifierSideA1,
      verifierSideA2,
      verifierSideB1,
      verifierSideB2,
      marketCreator,
      disputeCreator,
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
      ethers.utils.parseEther("750")
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
    basicFactory = await deployMockedContract<BasicFactoryV2>(
      "BasicFactoryV2",
      foreAccessManager.address,
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
        .setFactoryStatus([basicFactory.address], [true])
    );

    // sending funds
    await sendERC20Tokens(foreToken, {
      [predictorSideA1.address]: ethers.utils.parseEther("1000"),
      [predictorSideA2.address]: ethers.utils.parseEther("1000"),
      [predictorSideB1.address]: ethers.utils.parseEther("2000"),
      [predictorSideB2.address]: ethers.utils.parseEther("4000"),
      [marketCreator.address]: ethers.utils.parseEther("2360"),
      [disputeCreator.address]: ethers.utils.parseEther("2000"),
    });

    const previousBlock = await ethers.provider.getBlock("latest");
    blockTimestamp = previousBlock.timestamp;

    await txExec(
      foreToken
        .connect(marketCreator)
        .approve(basicFactory.address, ethers.utils.parseUnits("2360", "ether"))
    );

    // creating market
    const marketHash =
      "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab";

    await txExec(
      basicFactory
        .connect(marketCreator)
        .createMarket(
          marketHash,
          marketCreator.address,
          [
            ethers.utils.parseEther("1000"),
            ethers.utils.parseEther("0"),
            ethers.utils.parseEther("100"),
            ethers.utils.parseEther("250"),
            ethers.utils.parseEther("750"),
          ],
          blockTimestamp + 100000,
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
        .connect(marketCreator)
        .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
      foreToken
        .connect(verifierSideA1)
        .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
      foreToken
        .connect(verifierSideA2)
        .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
      foreToken
        .connect(verifierSideB1)
        .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
      foreToken
        .connect(verifierSideB2)
        .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
      foreToken
        .connect(predictorSideA1)
        .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
      foreToken
        .connect(predictorSideA2)
        .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
      foreToken
        .connect(predictorSideB1)
        .approve(contract.address, ethers.utils.parseUnits("2000", "ether")),
      foreToken
        .connect(predictorSideB2)
        .approve(contract.address, ethers.utils.parseUnits("4000", "ether")),
    ]);

    // create verifiers tokens
    // Approve 4 * 750 mint fee
    await executeInSingleBlock(() => [
      foreToken
        .connect(owner)
        .approve(
          foreProtocol.address,
          ethers.utils.parseUnits("3000", "ether")
        ),
      foreProtocol.connect(owner).mintVerifier(verifierSideA1.address),
      foreProtocol.connect(owner).mintVerifier(verifierSideA2.address),
      foreProtocol.connect(owner).mintVerifier(verifierSideB1.address),
      foreProtocol.connect(owner).mintVerifier(verifierSideB2.address),
    ]);
  });

  describe("Valid market", () => {
    beforeEach(async () => {
      /// predictions
      await contract
        .connect(predictorSideA1)
        .predict(ethers.utils.parseEther("500"), 0);
      await contract
        .connect(predictorSideA2)
        .predict(ethers.utils.parseEther("500"), 0);
      await contract
        .connect(predictorSideB1)
        .predict(ethers.utils.parseEther("1000"), 1);
      await contract
        .connect(predictorSideB2)
        .predict(ethers.utils.parseEther("2000"), 1);

      await timetravel(blockTimestamp + 300005);

      // verifications
      await contract.connect(verifierSideB2).verify(3, 1);
      await contract.connect(verifierSideA1).verify(0, 0);
      await contract.connect(verifierSideA2).verify(1, 0);
      await contract.connect(verifierSideB1).verify(2, 0);
    });

    // side a: 2000
    // side b: 3000
    // side a verifications: 2250
    // side b verifications: 750
    // won side: a
    // full market size: 5000
    // market creator reward: 0.5% = 25
    // validators creator reward: 2% = 100
    // burn, foundation: 1% each = 50

    describe("Market creator reward", () => {
      it("Should revert when market not closed", async () => {
        await expect(
          contract.connect(marketCreator).marketCreatorFeeWithdraw()
        ).to.be.revertedWith("MarketIsNotClosedYet");
      });

      it("Should allow to execute only by token owner", async () => {
        await timetravel(blockTimestamp + 4000000);

        await contract.connect(marketCreator).closeMarket();

        await assertIsAvailableOnlyForOwner(
          async (account) => {
            return contract.connect(account).marketCreatorFeeWithdraw();
          },
          marketCreator,
          "BasicMarket: Only Market Creator"
        );
      });

      describe("after closing", () => {
        let tx: ContractTransaction;
        let totalAmountToWithdraw = BigNumber.from(0);

        beforeEach(async () => {
          await timetravel(blockTimestamp + 4000000);
          await contract.connect(marketCreator).closeMarket();
          [tx] = await txExec(
            contract.connect(marketCreator).marketCreatorFeeWithdraw()
          );
          const { totalMarketSize } = await contract.marketInfo();
          const marketCreatorFeeRate = await calculateMarketCreatorFeeRate(
            contract
          );
          totalAmountToWithdraw = totalMarketSize
            .mul(marketCreatorFeeRate)
            .div(10000);
        });

        it("Should emit WithdrawReward event", async () => {
          await expect(tx)
            .to.emit(
              { ...marketLib, address: contract.address },
              "WithdrawReward"
            )
            .withArgs(marketCreator.address, 3, totalAmountToWithdraw);
        });

        it("Should emit NFT Transfer event", async () => {
          await expect(tx)
            .to.emit(foreProtocol, "Transfer")
            .withArgs(marketCreator.address, ethers.constants.AddressZero, 0);
        });

        it("Should emit Fore token Transfer event", async () => {
          await expect(tx)
            .to.emit(foreToken, "Transfer")
            .withArgs(
              contract.address,
              marketCreator.address,
              totalAmountToWithdraw
            );
        });
      });

      describe("after closing with exhausted token balance", () => {
        let tx: ContractTransaction;

        beforeEach(async () => {
          await timetravel(blockTimestamp + 4000000);

          await contract.connect(marketCreator).closeMarket();

          await foreToken.setVariable("_balances", {
            [contract.address]: ethers.utils.parseEther("20"),
          });

          [tx] = await txExec(
            contract.connect(marketCreator).marketCreatorFeeWithdraw()
          );
        });

        it("Should emit WithdrawReward event", async () => {
          await expect(tx)
            .to.emit(
              { ...marketLib, address: contract.address },
              "WithdrawReward"
            )
            .withArgs(marketCreator.address, 3, ethers.utils.parseEther("20"));
        });

        it("Should emit NFT Transfer event", async () => {
          await expect(tx)
            .to.emit(foreProtocol, "Transfer")
            .withArgs(marketCreator.address, ethers.constants.AddressZero, 0);
        });

        it("Should emit Fore token Transfer event", async () => {
          await expect(tx)
            .to.emit(foreToken, "Transfer")
            .withArgs(
              contract.address,
              marketCreator.address,
              ethers.utils.parseEther("20")
            );
        });
      });
    });

    describe("Prediction reward", () => {
      it("should have 0 prediction reward", async () => {
        expect(
          await contract
            .connect(predictorSideA1)
            .calculatePredictionReward(predictorSideA1.address)
        ).to.be.eql(BigNumber.from(0));
      });

      it("Should revert when market not closed", async () => {
        await expect(
          contract
            .connect(predictorSideA1)
            .withdrawPredictionReward(predictorSideA1.address)
        ).to.be.revertedWith("MarketIsNotClosedYet");
      });

      describe("after closing", () => {
        const estimatedRewardValue = BigNumber.from("1107579581151832460732");

        beforeEach(async () => {
          await timetravel(blockTimestamp + 4000000);

          await contract.connect(marketCreator).closeMarket();
        });

        it("Should calculate reward", async () => {
          expect(
            await contract
              .connect(predictorSideA1)
              .calculatePredictionReward(predictorSideA1.address)
          ).to.be.equal(estimatedRewardValue);
        });

        it("Should revert when no rewards exists", async () => {
          await expect(
            contract
              .connect(predictorSideA1)
              .withdrawPredictionReward(verifierSideB2.address)
          ).to.be.revertedWith("NothingToWithdraw");
        });

        describe("after withdrawn", () => {
          let tx: ContractTransaction;

          beforeEach(async () => {
            [tx] = await txExec(
              contract
                .connect(predictorSideA1)
                .withdrawPredictionReward(predictorSideA1.address)
            );
          });

          it("Should emit WithdrawReward event", async () => {
            await expect(tx)
              .to.emit(
                { ...marketLib, address: contract.address },
                "WithdrawReward"
              )
              .withArgs(
                predictorSideA1.address,
                1,
                BigNumber.from(estimatedRewardValue)
              );
          });

          it("Should emit Fore token Transfer event", async () => {
            await expect(tx)
              .to.emit(foreToken, "Transfer")
              .withArgs(
                contract.address,
                predictorSideA1.address,
                BigNumber.from(estimatedRewardValue)
              );
          });

          it("Should revert when rewards already withdrawn", async () => {
            await expect(
              contract
                .connect(predictorSideA1)
                .withdrawPredictionReward(predictorSideA1.address)
            ).to.be.revertedWith("AlreadyWithdrawn");
          });

          it("Should calculate 0 reward", async () => {
            expect(
              await contract
                .connect(predictorSideA1)
                .calculatePredictionReward(predictorSideA1.address)
            ).to.be.equal(0);
          });
        });
      });
    });

    describe("Verifier reward", () => {
      it("Should return 0 before market closed", async () => {
        expect(await contract.calculateVerificationReward(0)).to.be.eql([
          ethers.utils.parseEther("0"),
          ethers.utils.parseEther("0"),
          ethers.utils.parseEther("0"),
          false,
        ]);

        expect(await contract.calculateVerificationReward(1)).to.be.eql([
          ethers.utils.parseEther("0"),
          ethers.utils.parseEther("0"),
          ethers.utils.parseEther("0"),
          false,
        ]);
      });

      it("Should revert when not high guard or verifier", async () => {
        await expect(
          contract.connect(marketCreator).withdrawVerificationReward(0, false)
        ).to.be.revertedWith("BasicMarket: Only Verifier or HighGuard");
      });

      it("Should revert when market not closed", async () => {
        await expect(
          contract.connect(verifierSideB2).withdrawVerificationReward(0, false)
        ).to.be.revertedWith("MarketIsNotClosedYet");
      });

      describe("after positive dispute", () => {
        beforeEach(async () => {
          await timetravel(blockTimestamp + 300005 + 86400);
          await txExec(
            foreToken
              .connect(disputeCreator)
              .approve(
                contract.address,
                ethers.utils.parseUnits("1000", "ether")
              )
          );
          await contract
            .connect(disputeCreator)
            .openDispute(
              "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab"
            );

          await contract.connect(highGuardAccount).resolveDispute(2, 1);
        });

        it("Should return proper calculated value after market closed", async () => {
          const num = ethers.utils.parseEther("51.66");
          const num2 = ethers.utils
            .parseEther("750")
            .div(ethers.BigNumber.from(2));

          expect(await contract.calculateVerificationReward(1)).to.be.eql([
            ethers.utils.parseEther("0"),
            num2,
            num2,
            true,
          ]);
          expect(await contract.calculateVerificationReward(2)).to.be.eql([
            ethers.utils.parseEther("0"),
            num2,
            num2,
            true,
          ]);
          expect(await contract.calculateVerificationReward(3)).to.be.eql([
            ethers.utils.parseEther("0"),
            num2,
            num2,
            true,
          ]);
          expect(await contract.calculateVerificationReward(0)).to.be.eql([
            num,
            ethers.utils.parseEther("0"),
            ethers.utils.parseEther("0"),
            false,
          ]);
        });

        describe("Increase NFT power (proper verification)", () => {
          let tx: ContractTransaction;

          const num = ethers.utils.parseEther("51.66");

          beforeEach(async () => {
            [tx] = await txExec(
              contract
                .connect(verifierSideB2)
                .withdrawVerificationReward(0, false)
            );
          });

          it("Should emit WithdrawReward event", async () => {
            await expect(tx)
              .to.emit(
                { ...marketLib, address: contract.address },
                "WithdrawReward"
              )
              .withArgs(verifierSideB2.address, 2, num);
          });

          it("Should emit Fore token Transfer event", async () => {
            await expect(tx)
              .to.emit(foreToken, "Transfer")
              .withArgs(contract.address, foreVerifiers.address, num);
          });

          it("Should emit vNFT Transfer event", async () => {
            await expect(tx)
              .to.emit(foreVerifiers, "Transfer")
              .withArgs(contract.address, verifierSideB2.address, 3);
          });

          it("Should calculate 0 rewards", async () => {
            expect(await contract.calculateVerificationReward(0)).to.be.eql([
              ethers.utils.parseEther("0"),
              ethers.utils.parseEther("0"),
              ethers.utils.parseEther("0"),
              false,
            ]);
          });

          it("Should revert when rewards already withdrawn", async () => {
            await expect(
              contract
                .connect(highGuardAccount)
                .withdrawVerificationReward(0, false)
            ).to.be.revertedWith("AlreadyWithdrawn");
          });
        });

        describe("Withdraw reward (proper verification)", () => {
          let tx: ContractTransaction;

          const num = ethers.utils.parseEther("51.66");

          beforeEach(async () => {
            [tx] = await txExec(
              contract
                .connect(verifierSideB2)
                .withdrawVerificationReward(0, true)
            );
          });

          it("Should emit WithdrawReward event", async () => {
            await expect(tx)
              .to.emit(
                { ...marketLib, address: contract.address },
                "WithdrawReward"
              )
              .withArgs(verifierSideB2.address, 2, num);
          });

          it("Should emit Fore token Transfer event", async () => {
            await expect(tx)
              .to.emit(foreToken, "Transfer")
              .withArgs(contract.address, verifierSideB2.address, num);
          });

          it("Should emit vNFT Transfer event", async () => {
            await expect(tx)
              .to.emit(foreVerifiers, "Transfer")
              .withArgs(contract.address, verifierSideB2.address, 3);
          });

          it("Should emit token valuation increased event", async () => {
            await expect(tx)
              .to.emit(foreVerifiers, "TokenValidationIncreased")
              .withArgs(3, 1);
          });
        });

        describe("Withdraw reward (incorrect verification)", () => {
          let tx: ContractTransaction;

          const num = ethers.utils
            .parseEther("750")
            .div(ethers.BigNumber.from("2"));

          beforeEach(async () => {
            [tx] = await txExec(
              contract
                .connect(verifierSideA1)
                .withdrawVerificationReward(1, true)
            );
          });

          it("Should emit Fore token Transfer to HG", async () => {
            await expect(tx)
              .to.emit(foreToken, "Transfer")
              .withArgs(foreVerifiers.address, highGuardAccount.address, num);
          });

          it("Should emit Fore token Transfer to dispute creator", async () => {
            await expect(tx)
              .to.emit(foreToken, "Transfer")
              .withArgs(foreVerifiers.address, disputeCreator.address, num);
          });

          it("Should emit vNFT Transfer event (burn)", async () => {
            await expect(tx)
              .to.emit(foreVerifiers, "Transfer")
              .withArgs(contract.address, ethers.constants.AddressZero, 0);
          });
        });

        describe("Withdraw reward with exhausted token balance", () => {
          let tx: ContractTransaction;
          const num = ethers.utils.parseEther("30");

          beforeEach(async () => {
            await foreToken.setVariable("_balances", {
              [contract.address]: num,
            });

            [tx] = await txExec(
              contract
                .connect(verifierSideB2)
                .withdrawVerificationReward(0, true)
            );
          });

          it("Should emit WithdrawReward event", async () => {
            await expect(tx)
              .to.emit(
                { ...marketLib, address: contract.address },
                "WithdrawReward"
              )
              .withArgs(
                verifierSideB2.address,
                2,
                ethers.utils.parseEther("51.66")
              );
          });

          it("Should emit Fore token Transfer event", async () => {
            await expect(tx)
              .to.emit(foreToken, "Transfer")
              .withArgs(contract.address, verifierSideB2.address, num);
          });

          it("Should emit vNFT Transfer event", async () => {
            await expect(tx)
              .to.emit(foreVerifiers, "Transfer")
              .withArgs(contract.address, verifierSideB2.address, 3);
          });

          it("Should emit token valuation increased event", async () => {
            await expect(tx)
              .to.emit(foreVerifiers, "TokenValidationIncreased")
              .withArgs(3, 1);
          });
        });
      });

      describe("after closing", () => {
        beforeEach(async () => {
          await timetravel(blockTimestamp + 4000000);

          await contract.connect(marketCreator).closeMarket();
        });

        it("should return proper market result", async () => {
          expect((await contract.marketInfo()).result).to.be.eql(2);
        });

        it("Should return proper power", async () => {
          expect(await foreVerifiers.powerOf(3)).to.be.eql(
            ethers.utils.parseEther("750")
          );
        });

        it("Should return proper verification", async () => {
          expect(await contract.verifications(0)).to.be.eql([
            verifierSideB2.address,
            ethers.utils.parseEther("750"),
            BigNumber.from(3),
            1,
            false,
          ]);
        });

        it("Should return proper calculated value after market closed", async () => {
          const num = ethers.utils
            .parseEther("51.66")
            .div(ethers.BigNumber.from("3"));

          expect(await contract.calculateVerificationReward(1)).to.be.eql([
            num,
            ethers.utils.parseEther("0"),
            ethers.utils.parseEther("0"),
            false,
          ]);
          expect(await contract.calculateVerificationReward(2)).to.be.eql([
            num,
            ethers.utils.parseEther("0"),
            ethers.utils.parseEther("0"),
            false,
          ]);
          expect(await contract.calculateVerificationReward(3)).to.be.eql([
            num,
            ethers.utils.parseEther("0"),
            ethers.utils.parseEther("0"),
            false,
          ]);
          expect(await contract.calculateVerificationReward(0)).to.be.eql([
            ethers.utils.parseEther("0"),
            ethers.utils.parseEther("0"),
            ethers.utils.parseEther("0"),
            true,
          ]);
        });

        describe("Withdraw reward (proper verification)", () => {
          let tx: ContractTransaction;

          const num = ethers.utils
            .parseEther("51.66")
            .div(ethers.BigNumber.from("3"));

          beforeEach(async () => {
            [tx] = await txExec(
              contract
                .connect(verifierSideA1)
                .withdrawVerificationReward(1, true)
            );
          });

          it("Should emit WithdrawReward event", async () => {
            await expect(tx)
              .to.emit(
                { ...marketLib, address: contract.address },
                "WithdrawReward"
              )
              .withArgs(verifierSideA1.address, 2, num);
          });

          it("Should emit Fore token Transfer event", async () => {
            await expect(tx)
              .to.emit(foreToken, "Transfer")
              .withArgs(contract.address, verifierSideA1.address, num);
          });

          it("Should emit vNFT Transfer event", async () => {
            await expect(tx)
              .to.emit(foreVerifiers, "Transfer")
              .withArgs(contract.address, verifierSideA1.address, 0);
          });
        });

        describe("Withdraw reward (incorrect verification)", () => {
          let tx: ContractTransaction;

          beforeEach(async () => {
            [tx] = await txExec(
              contract
                .connect(verifierSideB2)
                .withdrawVerificationReward(0, true)
            );
          });

          it("Should emit Fore token Transfer event (burn)", async () => {
            await expect(tx)
              .to.emit(foreToken, "Transfer")
              .withArgs(
                foreVerifiers.address,
                "0x000000000000000000000000000000000000dEaD",
                ethers.utils.parseEther("750")
              );
          });

          it("Should emit vNFT Transfer event (burn)", async () => {
            await expect(tx)
              .to.emit(foreVerifiers, "Transfer")
              .withArgs(contract.address, ethers.constants.AddressZero, 3);
          });
        });
      });
    });
  });

  describe("Valid market B WON", () => {
    beforeEach(async () => {
      /// predictions
      await contract
        .connect(predictorSideA1)
        .predict(ethers.utils.parseEther("500"), 0);
      await contract
        .connect(predictorSideA2)
        .predict(ethers.utils.parseEther("500"), 0);
      await contract
        .connect(predictorSideB1)
        .predict(ethers.utils.parseEther("1000"), 1);
      await contract
        .connect(predictorSideB2)
        .predict(ethers.utils.parseEther("2000"), 1);

      await timetravel(blockTimestamp + 300000 + 1);
      await executeInSingleBlock(() => [
        contract.connect(verifierSideA1).verify(0, 1),
        contract.connect(verifierSideA2).verify(1, 1),
      ]);
    });

    describe("Prediction reward", () => {
      it("Should revert when market not closed", async () => {
        await expect(
          contract
            .connect(predictorSideB2)
            .withdrawPredictionReward(predictorSideB2.address)
        ).to.be.revertedWith("MarketIsNotClosedYet");
      });

      describe("after closing", () => {
        const estimatedPredictionReward = BigNumber.from(
          "3099600000000000000000"
        );

        beforeEach(async () => {
          await timetravel(blockTimestamp + 4000000);

          await contract.connect(marketCreator).closeMarket();
        });

        it("Should calculate reward", async () => {
          expect(
            await contract
              .connect(predictorSideB2)
              .calculatePredictionReward(predictorSideB2.address)
          ).to.be.equal(estimatedPredictionReward);
        });

        it("Should revert when no rewards exists", async () => {
          await expect(
            contract
              .connect(predictorSideB2)
              .withdrawPredictionReward(verifierSideB2.address)
          ).to.be.revertedWith("NothingToWithdraw");
        });

        describe("after withdrawn", () => {
          let tx: ContractTransaction;

          beforeEach(async () => {
            [tx] = await txExec(
              contract
                .connect(predictorSideB2)
                .withdrawPredictionReward(predictorSideB2.address)
            );
          });

          it("Should emit WithdrawReward event", async () => {
            await expect(tx)
              .to.emit(
                { ...marketLib, address: contract.address },
                "WithdrawReward"
              )
              .withArgs(predictorSideB2.address, 1, estimatedPredictionReward);
          });

          it("Should emit Fore token Transfer event", async () => {
            await expect(tx)
              .to.emit(foreToken, "Transfer")
              .withArgs(
                contract.address,
                predictorSideB2.address,
                estimatedPredictionReward
              );
          });

          it("Should revert when rewards already withdrawn", async () => {
            await expect(
              contract
                .connect(predictorSideB2)
                .withdrawPredictionReward(predictorSideB2.address)
            ).to.be.revertedWith("AlreadyWithdrawn");
          });

          it("Should calculate 0 reward", async () => {
            expect(
              await contract
                .connect(predictorSideB2)
                .calculatePredictionReward(predictorSideB2.address)
            ).to.be.equal(0);
          });
        });

        describe("after withdrawn with exhausted token balance", () => {
          let tx: ContractTransaction;

          beforeEach(async () => {
            await foreToken.setVariable("_balances", {
              [contract.address]: ethers.utils.parseEther("3000"),
            });

            [tx] = await txExec(
              contract
                .connect(predictorSideB2)
                .withdrawPredictionReward(predictorSideB2.address)
            );
          });

          it("Should emit WithdrawReward event", async () => {
            await expect(tx)
              .to.emit(
                { ...marketLib, address: contract.address },
                "WithdrawReward"
              )
              .withArgs(predictorSideB2.address, 1, estimatedPredictionReward);
          });

          it("Should emit Fore token Transfer event", async () => {
            await expect(tx)
              .to.emit(foreToken, "Transfer")
              .withArgs(
                contract.address,
                predictorSideB2.address,
                ethers.utils.parseEther("3000")
              );
          });
        });
      });
    });
  });

  describe("Valid market DRAW", () => {
    beforeEach(async () => {
      /// predictions
      await contract
        .connect(predictorSideA1)
        .predict(ethers.utils.parseEther("500"), 0);
      await contract
        .connect(predictorSideA2)
        .predict(ethers.utils.parseEther("500"), 0);
      await contract
        .connect(predictorSideB1)
        .predict(ethers.utils.parseEther("1000"), 1);
      await contract
        .connect(predictorSideB2)
        .predict(ethers.utils.parseEther("2000"), 1);

      await timetravel(blockTimestamp + 300000 + 1);
      await executeInSingleBlock(() => [
        contract.connect(verifierSideA1).verify(0, 0),
        contract.connect(verifierSideA2).verify(1, 1),
      ]);
    });

    describe("Prediction reward", () => {
      const estimatedPredictionReward = BigNumber.from("368550000000000000000");

      it("Should revert when market not closed", async () => {
        await expect(
          contract
            .connect(predictorSideA1)
            .withdrawPredictionReward(predictorSideA1.address)
        ).to.be.revertedWith("MarketIsNotClosedYet");
      });

      describe("after closing", () => {
        beforeEach(async () => {
          await timetravel(blockTimestamp + 4000000);

          await contract.connect(marketCreator).closeMarket();
        });

        it("Should calculate reward", async () => {
          expect(
            await contract
              .connect(predictorSideA1)
              .calculatePredictionReward(predictorSideA1.address)
          ).to.be.equal(estimatedPredictionReward);
        });

        it("Should revert when no rewards exists", async () => {
          await expect(
            contract
              .connect(predictorSideA1)
              .withdrawPredictionReward(verifierSideB2.address)
          ).to.be.revertedWith("NothingToWithdraw");
        });

        describe("after withdrawn", () => {
          let tx: ContractTransaction;

          beforeEach(async () => {
            [tx] = await txExec(
              contract
                .connect(predictorSideA1)
                .withdrawPredictionReward(predictorSideA1.address)
            );
          });

          it("Should emit WithdrawReward event", async () => {
            await expect(tx)
              .to.emit(
                { ...marketLib, address: contract.address },
                "WithdrawReward"
              )
              .withArgs(predictorSideA1.address, 1, estimatedPredictionReward);
          });

          it("Should emit Fore token Transfer event", async () => {
            await expect(tx)
              .to.emit(foreToken, "Transfer")
              .withArgs(
                contract.address,
                predictorSideA1.address,
                estimatedPredictionReward
              );
          });

          it("Should revert when rewards already withdrawn", async () => {
            await expect(
              contract
                .connect(predictorSideA1)
                .withdrawPredictionReward(predictorSideA1.address)
            ).to.be.revertedWith("AlreadyWithdrawn");
          });

          it("Should calculate 0 reward", async () => {
            expect(
              await contract
                .connect(predictorSideA1)
                .calculatePredictionReward(predictorSideA1.address)
            ).to.be.equal(0);
          });
        });
      });
    });

    describe("Verification reward", () => {
      it("Should revert when market not closed", async () => {
        await expect(
          contract.connect(verifierSideA1).withdrawVerificationReward(0, false)
        ).to.be.revertedWith("MarketIsNotClosedYet");
      });

      describe("after closing", () => {
        beforeEach(async () => {
          await timetravel(blockTimestamp + 4000000);
          await contract.connect(marketCreator).closeMarket();
        });

        it("Should calculate reward", async () => {
          expect(
            await contract
              .connect(verifierSideA1)
              .calculateVerificationReward(0)
          ).to.be.eql([
            ethers.utils.parseEther("0"),
            ethers.utils.parseEther("0"),
            ethers.utils.parseEther("0"),
            false,
          ]);
        });
      });
    });
  });

  describe("Invalid market", () => {
    beforeEach(async () => {
      await contract
        .connect(predictorSideA1)
        .predict(ethers.utils.parseEther("500"), 0);

      await timetravel(blockTimestamp + 300005);
      await contract.connect(verifierSideA1).verify(0, 0);
    });

    describe("Market creator reward", () => {
      it("Should revert with OnlyForValidMarkets", async () => {
        await expect(
          contract.connect(marketCreator).marketCreatorFeeWithdraw()
        ).to.be.revertedWith("OnlyForValidMarkets");
      });
    });

    describe("Prediction reward", () => {
      it("Should return correct prediction reward", async () => {
        expect(
          await contract
            .connect(predictorSideA1)
            .calculatePredictionReward(predictorSideA1.address)
        ).to.be.equal(ethers.utils.parseEther("455"));
      });
    });
  });

  describe("with usdc market", () => {
    beforeEach(async () => {
      await sendERC20Tokens(usdcToken, {
        [predictorSideA1.address]: ethers.utils.parseEther("1000"),
        [predictorSideA2.address]: ethers.utils.parseEther("1000"),
        [predictorSideB1.address]: ethers.utils.parseEther("2000"),
        [predictorSideB2.address]: ethers.utils.parseEther("4000"),
        [marketCreator.address]: ethers.utils.parseEther("2360"),
        [disputeCreator.address]: ethers.utils.parseEther("2000"),
      });

      const previousBlock = await ethers.provider.getBlock("latest");
      blockTimestamp = previousBlock.timestamp;

      await txExec(
        usdcToken
          .connect(marketCreator)
          .approve(
            basicFactory.address,
            ethers.utils.parseUnits("2360", "ether")
          )
      );

      const marketHash = generateRandomHexString(64);
      await txExec(
        basicFactory
          .connect(marketCreator)
          .createMarket(
            marketHash,
            marketCreator.address,
            [
              ethers.utils.parseEther("1000"),
              ethers.utils.parseEther("0"),
              ethers.utils.parseEther("100"),
              ethers.utils.parseEther("250"),
              ethers.utils.parseEther("750"),
            ],
            blockTimestamp + 100000,
            blockTimestamp + 300000,
            usdcToken.address
          )
      );

      const initCode = await basicFactory.INIT_CODE_PAIR_HASH();
      const salt = marketHash;
      const newAddress = ethers.utils.getCreate2Address(
        basicFactory.address,
        salt,
        initCode
      );

      contract = await attachContract<BasicMarketV2>(
        "BasicMarketV2",
        newAddress
      );

      await executeInSingleBlock(() => [
        usdcToken
          .connect(marketCreator)
          .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
        usdcToken
          .connect(verifierSideA1)
          .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
        usdcToken
          .connect(verifierSideA2)
          .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
        usdcToken
          .connect(verifierSideB1)
          .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
        usdcToken
          .connect(verifierSideB2)
          .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
        usdcToken
          .connect(predictorSideA1)
          .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
        usdcToken
          .connect(predictorSideA2)
          .approve(contract.address, ethers.utils.parseUnits("1000", "ether")),
        usdcToken
          .connect(predictorSideB1)
          .approve(contract.address, ethers.utils.parseUnits("2000", "ether")),
        usdcToken
          .connect(predictorSideB2)
          .approve(contract.address, ethers.utils.parseUnits("4000", "ether")),
      ]);

      await executeInSingleBlock(() => [
        foreToken
          .connect(owner)
          .approve(
            foreProtocol.address,
            ethers.utils.parseUnits("3000", "ether")
          ),
        foreProtocol.connect(owner).mintVerifier(verifierSideA1.address),
        foreProtocol.connect(owner).mintVerifier(verifierSideA2.address),
        foreProtocol.connect(owner).mintVerifier(verifierSideB1.address),
        foreProtocol.connect(owner).mintVerifier(verifierSideB2.address),
      ]);
    });

    describe("Valid market", () => {
      beforeEach(async () => {
        await contract
          .connect(predictorSideA1)
          .predict(ethers.utils.parseEther("500"), 0);
        await contract
          .connect(predictorSideA2)
          .predict(ethers.utils.parseEther("500"), 0);
        await contract
          .connect(predictorSideB1)
          .predict(ethers.utils.parseEther("1000"), 1);
        await contract
          .connect(predictorSideB2)
          .predict(ethers.utils.parseEther("2000"), 1);

        await timetravel(blockTimestamp + 300005);
        await contract.connect(verifierSideB2).verify(3, 1);
        await contract.connect(verifierSideA1).verify(0, 0);
        await contract.connect(verifierSideA2).verify(1, 0);
        await contract.connect(verifierSideB1).verify(2, 0);
      });

      describe("Verifier reward", () => {
        it("Should return 0 before market closed", async () => {
          expect(await contract.calculateVerificationReward(0)).to.be.eql([
            ethers.utils.parseEther("0"),
            ethers.utils.parseEther("0"),
            ethers.utils.parseEther("0"),
            false,
          ]);

          expect(await contract.calculateVerificationReward(1)).to.be.eql([
            ethers.utils.parseEther("0"),
            ethers.utils.parseEther("0"),
            ethers.utils.parseEther("0"),
            false,
          ]);
        });

        describe("after closing", () => {
          beforeEach(async () => {
            await timetravel(blockTimestamp + 4000000);

            await contract.connect(marketCreator).closeMarket();
          });

          it("Should return proper verification", async () => {
            expect(await contract.verifications(0)).to.be.eql([
              verifierSideB2.address,
              ethers.utils.parseEther("750"),
              BigNumber.from(3),
              1,
              false,
            ]);
          });

          it("Should return proper calculated value after market closed", async () => {
            const num = ethers.utils
              .parseEther("51.66")
              .div(ethers.BigNumber.from("3"));
            expect(await contract.calculateVerificationReward(1)).to.be.eql([
              num,
              ethers.utils.parseEther("0"),
              ethers.utils.parseEther("0"),
              false,
            ]);
            expect(await contract.calculateVerificationReward(2)).to.be.eql([
              num,
              ethers.utils.parseEther("0"),
              ethers.utils.parseEther("0"),
              false,
            ]);
            expect(await contract.calculateVerificationReward(3)).to.be.eql([
              num,
              ethers.utils.parseEther("0"),
              ethers.utils.parseEther("0"),
              false,
            ]);
            expect(await contract.calculateVerificationReward(0)).to.be.eql([
              ethers.utils.parseEther("0"),
              ethers.utils.parseEther("0"),
              ethers.utils.parseEther("0"),
              true,
            ]);
          });

          it("should revert increase NFT power reward", async () => {
            await expect(
              contract
                .connect(verifierSideA1)
                .withdrawVerificationReward(1, false)
            ).to.be.revertedWith("OnlyForFOREDenominatedMarkets");
          });

          describe("Withdraw reward (proper verification)", () => {
            let tx: ContractTransaction;

            const num = ethers.utils
              .parseEther("51.66")
              .div(ethers.BigNumber.from("3"));

            beforeEach(async () => {
              [tx] = await txExec(
                contract
                  .connect(verifierSideA1)
                  .withdrawVerificationReward(1, true)
              );
            });

            it("Should emit WithdrawReward event", async () => {
              await expect(tx)
                .to.emit(
                  { ...marketLib, address: contract.address },
                  "WithdrawReward"
                )
                .withArgs(verifierSideA1.address, 2, num);
            });

            it("Should emit usdc token Transfer event", async () => {
              await expect(tx)
                .to.emit(usdcToken, "Transfer")
                .withArgs(contract.address, verifierSideA1.address, num);
            });

            it("Should emit vNFT Transfer event", async () => {
              await expect(tx)
                .to.emit(foreVerifiers, "Transfer")
                .withArgs(contract.address, verifierSideA1.address, 0);
            });
          });
        });
      });
    });
  });
});
