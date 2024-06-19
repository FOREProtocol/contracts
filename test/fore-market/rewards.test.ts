import { BasicMarket } from "@/BasicMarket";
import { ForeProtocol, MarketCreatedEvent } from "@/ForeProtocol";
import { BasicFactory } from "@/BasicFactory";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers } from "@/ForeVerifiers";
import { ProtocolConfig } from "@/ProtocolConfig";
import { MarketLib } from "@/MarketLib";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";
import { ContractReceipt } from "@ethersproject/contracts/src.ts/index";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, ContractTransaction, Signer } from "ethers";
import { ethers } from "hardhat";
import {
    attachContract,
    deployLibrary,
    deployMockedContract,
    executeInSingleBlock,
    findEvent,
    impersonateContract,
    sendERC20Tokens,
    timetravel,
    txExec,
    assertIsAvailableOnlyForOwner,
} from "../helpers/utils";

describe("BasicMarket / Rewards", () => {
    let owner: SignerWithAddress;
    let foundationWallet: SignerWithAddress;
    let highGuardAccount: SignerWithAddress;
    let marketplaceContract: SignerWithAddress;
    let foreProtocolAccount: Signer;
    let basicFactoryAccount: Signer;
    let predictorSideA1: SignerWithAddress;
    let predictorSideA2: SignerWithAddress;
    let predictorSideB1: SignerWithAddress;
    let predictorSideB2: SignerWithAddress;
    let verifierSideA1: SignerWithAddress;
    let verifierSideA2: SignerWithAddress;
    let verifierSideB1: SignerWithAddress;
    let verifierSideB2: SignerWithAddress;
    let marketCreator: SignerWithAddress;
    let marketLib: MarketLib;
    let disputeCreator: SignerWithAddress;

    let protocolConfig: MockContract<ProtocolConfig>;
    let foreToken: MockContract<ForeToken>;
    let foreVerifiers: MockContract<ForeVerifiers>;
    let foreProtocol: MockContract<ForeProtocol>;
    let basicFactory: MockContract<BasicFactory>;
    let contract: BasicMarket;

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
        ] = await ethers.getSigners();

        const newLocal = "BasicMarket";
        // deploy library
        marketLib = await deployLibrary("MarketLib", [
            newLocal,
            "BasicFactory",
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
        foreProtocolAccount = await impersonateContract(foreProtocol.address);

        basicFactory = await deployMockedContract<BasicFactory>(
            "BasicFactory",
            foreProtocol.address
        );
        basicFactoryAccount = await impersonateContract(basicFactory.address);

        // factory assignment
        await txExec(foreVerifiers.setProtocol(foreProtocol.address));

        await txExec(
            protocolConfig
                .connect(owner)
                .setFactoryStatus([basicFactory.address], [true])
        );

        // sending funds
        await sendERC20Tokens(foreToken, {
            [predictorSideA1.address]: ethers.utils.parseEther("500"),
            [predictorSideA2.address]: ethers.utils.parseEther("500"),
            [predictorSideB1.address]: ethers.utils.parseEther("1000"),
            [predictorSideB2.address]: ethers.utils.parseEther("2000"),
            [marketCreator.address]: ethers.utils.parseEther("1010"),
            [disputeCreator.address]: ethers.utils.parseEther("2000"),
        });

        const previousBlock = await ethers.provider.getBlock("latest");
        blockTimestamp = previousBlock.timestamp;

        await txExec(
            foreToken
                .connect(marketCreator)
                .approve(
                    basicFactory.address,
                    ethers.utils.parseUnits("1010", "ether")
                )
        );

        // creating market
        const marketHash =
            "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab";

        const [tx, recipt] = await txExec(
            basicFactory
                .connect(marketCreator)
                .createMarket(
                    marketHash,
                    marketCreator.address,
                    ethers.utils.parseEther("1000"),
                    ethers.utils.parseEther("0"),
                    blockTimestamp + 100000,
                    blockTimestamp + 300000
                )
        );

        const initCode = await basicFactory.INIT_CODE_PAIR_HASH();

        const salt = marketHash;
        const newAddress = ethers.utils.getCreate2Address(
            basicFactory.address,
            salt,
            initCode
        );

        contract = await attachContract<BasicMarket>("BasicMarket", newAddress);
        await executeInSingleBlock(() => [
            foreToken
                .connect(marketCreator)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("1000", "ether")
                ),
            foreToken
                .connect(verifierSideA1)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("1000", "ether")
                ),
            foreToken
                .connect(verifierSideA2)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("1000", "ether")
                ),
            foreToken
                .connect(verifierSideB1)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("1000", "ether")
                ),
            foreToken
                .connect(verifierSideB2)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("1000", "ether")
                ),
            foreToken
                .connect(predictorSideA1)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("500", "ether")
                ),
            foreToken
                .connect(predictorSideA2)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("500", "ether")
                ),
            foreToken
                .connect(predictorSideB1)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("1000", "ether")
                ),
            foreToken
                .connect(predictorSideB2)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("2000", "ether")
                ),
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
                .predict(ethers.utils.parseEther("500"), true);
            await contract
                .connect(predictorSideA2)
                .predict(ethers.utils.parseEther("500"), true);
            await contract
                .connect(predictorSideB1)
                .predict(ethers.utils.parseEther("1000"), false);
            await contract
                .connect(predictorSideB2)
                .predict(ethers.utils.parseEther("2000"), false);

            await timetravel(blockTimestamp + 300005);

            // verifications
            await contract.connect(verifierSideB2).verify(3, false);
            await contract.connect(verifierSideA1).verify(0, true);
            await contract.connect(verifierSideA2).verify(1, true);
            await contract.connect(verifierSideB1).verify(2, true);
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
                        return contract
                            .connect(account)
                            .marketCreatorFeeWithdraw();
                    },
                    marketCreator,
                    "BasicMarket: Only Market Creator"
                );
            });

            describe("after closing", () => {
                let tx: ContractTransaction;
                let recipt: ContractReceipt;
                beforeEach(async () => {
                    await timetravel(blockTimestamp + 4000000);

                    await contract.connect(marketCreator).closeMarket();

                    [tx, recipt] = await txExec(
                        contract
                            .connect(marketCreator)
                            .marketCreatorFeeWithdraw()
                    );
                });

                it("Should emit WithdrawReward event", async () => {
                    await expect(tx)
                        .to.emit(
                            { ...marketLib, address: contract.address },
                            "WithdrawReward"
                        )
                        .withArgs(
                            marketCreator.address,
                            3,
                            ethers.utils.parseEther("25")
                        );
                });

                it("Should emit NFT Transfer event", async () => {
                    await expect(tx)
                        .to.emit(foreProtocol, "Transfer")
                        .withArgs(
                            marketCreator.address,
                            ethers.constants.AddressZero,
                            0
                        );
                });

                it("Should emit Fore token Transfer event", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            marketCreator.address,
                            ethers.utils.parseEther("25")
                        );
                });
            });

            describe("after closing with exchausted token balance", () => {
                let tx: ContractTransaction;
                let recipt: ContractReceipt;
                beforeEach(async () => {
                    await timetravel(blockTimestamp + 4000000);

                    await contract.connect(marketCreator).closeMarket();

                    await foreToken.setVariable("_balances", {
                        [contract.address]: ethers.utils.parseEther("20"),
                    });

                    [tx, recipt] = await txExec(
                        contract
                            .connect(marketCreator)
                            .marketCreatorFeeWithdraw()
                    );
                });

                it("Should emit WithdrawReward event", async () => {
                    await expect(tx)
                        .to.emit(
                            { ...marketLib, address: contract.address },
                            "WithdrawReward"
                        )
                        .withArgs(
                            marketCreator.address,
                            3,
                            ethers.utils.parseEther("20")
                        );
                });

                it("Should emit NFT Transfer event", async () => {
                    await expect(tx)
                        .to.emit(foreProtocol, "Transfer")
                        .withArgs(
                            marketCreator.address,
                            ethers.constants.AddressZero,
                            0
                        );
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
                    ).to.be.equal(ethers.utils.parseEther("1187.5"));
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
                    let recipt: ContractReceipt;
                    beforeEach(async () => {
                        [tx, recipt] = await txExec(
                            contract
                                .connect(predictorSideA1)
                                .withdrawPredictionReward(
                                    predictorSideA1.address
                                )
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
                                ethers.utils.parseEther("1187.5")
                            );
                    });

                    it("Should emit Fore token Transfer event", async () => {
                        await expect(tx)
                            .to.emit(foreToken, "Transfer")
                            .withArgs(
                                contract.address,
                                predictorSideA1.address,
                                ethers.utils.parseEther("1187.5")
                            );
                    });

                    it("Should revert when rewards already withdrawn", async () => {
                        await expect(
                            contract
                                .connect(predictorSideA1)
                                .withdrawPredictionReward(
                                    predictorSideA1.address
                                )
                        ).to.be.revertedWith("AlreadyWithdrawn");
                    });

                    it("Should calculate 0 reward", async () => {
                        expect(
                            await contract
                                .connect(predictorSideA1)
                                .calculatePredictionReward(
                                    predictorSideA1.address
                                )
                        ).to.be.equal(0);
                    });
                });
            });
        });

        describe("Verifier reward", () => {
            it("Should return 0 before market closed", async () => {
                expect(await contract.calculateVerificationReward(0)).to.be.eql(
                    [
                        ethers.utils.parseEther("0"),
                        ethers.utils.parseEther("0"),
                        ethers.utils.parseEther("0"),
                        false,
                    ]
                );

                expect(await contract.calculateVerificationReward(1)).to.be.eql(
                    [
                        ethers.utils.parseEther("0"),
                        ethers.utils.parseEther("0"),
                        ethers.utils.parseEther("0"),
                        false,
                    ]
                );
            });

            it("Should revert when not highguard or verifier", async () => {
                await expect(
                    contract
                        .connect(marketCreator)
                        .withdrawVerificationReward(0, false)
                ).to.be.revertedWith("BasicMarket: Only Verifier or HighGuard");
            });

            it("Should revert when market not closed", async () => {
                await expect(
                    contract
                        .connect(verifierSideB2)
                        .withdrawVerificationReward(0, false)
                ).to.be.revertedWith("MarketIsNotClosedYet");
            });

            describe("after positive dispute", () => {
                let tx: ContractTransaction;
                let recipt: ContractReceipt;
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

                    await contract.connect(highGuardAccount).resolveDispute(2);
                });

                it("Should return proper calculated value after market closed", async () => {
                    const num = ethers.utils.parseEther("100");
                    const num2 = ethers.utils
                        .parseEther("750")
                        .div(ethers.BigNumber.from(2));
                    expect(
                        await contract.calculateVerificationReward(1)
                    ).to.be.eql([
                        ethers.utils.parseEther("0"),
                        num2,
                        num2,
                        true,
                    ]);
                    expect(
                        await contract.calculateVerificationReward(2)
                    ).to.be.eql([
                        ethers.utils.parseEther("0"),
                        num2,
                        num2,
                        true,
                    ]);
                    expect(
                        await contract.calculateVerificationReward(3)
                    ).to.be.eql([
                        ethers.utils.parseEther("0"),
                        num2,
                        num2,
                        true,
                    ]);
                    expect(
                        await contract.calculateVerificationReward(0)
                    ).to.be.eql([
                        num,
                        ethers.utils.parseEther("0"),
                        ethers.utils.parseEther("0"),
                        false,
                    ]);
                });

                describe("Increase NFT power (proper verification)", () => {
                    let tx: ContractTransaction;
                    let recipt: ContractReceipt;
                    const num = ethers.utils.parseEther("100");

                    beforeEach(async () => {
                        [tx, recipt] = await txExec(
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
                            .withArgs(
                                contract.address,
                                foreVerifiers.address,
                                num
                            );
                    });

                    it("Should emit vNFT Transfer event", async () => {
                        await expect(tx)
                            .to.emit(foreVerifiers, "Transfer")
                            .withArgs(
                                contract.address,
                                verifierSideB2.address,
                                3
                            );
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
                    let recipt: ContractReceipt;
                    const num = ethers.utils.parseEther("100");

                    beforeEach(async () => {
                        [tx, recipt] = await txExec(
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
                            .withArgs(
                                contract.address,
                                verifierSideB2.address,
                                num
                            );
                    });

                    it("Should emit vNFT Transfer event", async () => {
                        await expect(tx)
                            .to.emit(foreVerifiers, "Transfer")
                            .withArgs(
                                contract.address,
                                verifierSideB2.address,
                                3
                            );
                    });

                    it("Should emit token valuation increased event", async () => {
                        await expect(tx)
                            .to.emit(foreVerifiers, "TokenValidationIncreased")
                            .withArgs(3, 1);
                    });
                });

                describe("Withdraw reward (incorrect verification)", () => {
                    let tx: ContractTransaction;
                    let recipt: ContractReceipt;
                    const num = ethers.utils
                        .parseEther("750")
                        .div(ethers.BigNumber.from("2"));

                    beforeEach(async () => {
                        [tx, recipt] = await txExec(
                            contract
                                .connect(verifierSideA1)
                                .withdrawVerificationReward(1, true)
                        );
                    });

                    it("Should emit Fore token Transfer to HG", async () => {
                        await expect(tx)
                            .to.emit(foreToken, "Transfer")
                            .withArgs(
                                foreVerifiers.address,
                                highGuardAccount.address,
                                num
                            );
                    });

                    it("Should emit Fore token Transfer to dispute creator", async () => {
                        await expect(tx)
                            .to.emit(foreToken, "Transfer")
                            .withArgs(
                                foreVerifiers.address,
                                disputeCreator.address,
                                num
                            );
                    });

                    it("Should emit vNFT Transfer event (burn)", async () => {
                        await expect(tx)
                            .to.emit(foreVerifiers, "Transfer")
                            .withArgs(
                                contract.address,
                                ethers.constants.AddressZero,
                                0
                            );
                    });
                });

                describe("Withdraw reward with exhausted token balance", () => {
                    let tx: ContractTransaction;
                    let recipt: ContractReceipt;
                    const num = ethers.utils.parseEther("100");

                    beforeEach(async () => {
                        await foreToken.setVariable("_balances", {
                            [contract.address]: ethers.utils.parseEther("80"),
                        });

                        [tx, recipt] = await txExec(
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
                            .withArgs(
                                contract.address,
                                verifierSideB2.address,
                                ethers.utils.parseEther("80")
                            );
                    });

                    it("Should emit vNFT Transfer event", async () => {
                        await expect(tx)
                            .to.emit(foreVerifiers, "Transfer")
                            .withArgs(
                                contract.address,
                                verifierSideB2.address,
                                3
                            );
                    });

                    it("Should emit token valuation increased event", async () => {
                        await expect(tx)
                            .to.emit(foreVerifiers, "TokenValidationIncreased")
                            .withArgs(3, 1);
                    });
                });
            });

            describe("after closing", () => {
                let tx: ContractTransaction;
                let recipt: ContractReceipt;
                beforeEach(async () => {
                    await timetravel(blockTimestamp + 4000000);

                    await contract.connect(marketCreator).closeMarket();
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
                        false,
                        false,
                    ]);
                });

                it("Should return proper calculated value after market closed", async () => {
                    const num = ethers.utils
                        .parseEther("100")
                        .div(ethers.BigNumber.from("3"));
                    expect(
                        await contract.calculateVerificationReward(1)
                    ).to.be.eql([
                        num,
                        ethers.utils.parseEther("0"),
                        ethers.utils.parseEther("0"),
                        false,
                    ]);
                    expect(
                        await contract.calculateVerificationReward(2)
                    ).to.be.eql([
                        num,
                        ethers.utils.parseEther("0"),
                        ethers.utils.parseEther("0"),
                        false,
                    ]);
                    expect(
                        await contract.calculateVerificationReward(3)
                    ).to.be.eql([
                        num,
                        ethers.utils.parseEther("0"),
                        ethers.utils.parseEther("0"),
                        false,
                    ]);
                    expect(
                        await contract.calculateVerificationReward(0)
                    ).to.be.eql([
                        ethers.utils.parseEther("0"),
                        ethers.utils.parseEther("0"),
                        ethers.utils.parseEther("0"),
                        true,
                    ]);
                });

                describe("Withdraw reward (proper verification)", () => {
                    let tx: ContractTransaction;
                    let recipt: ContractReceipt;
                    const num = ethers.utils
                        .parseEther("100")
                        .div(ethers.BigNumber.from("3"));

                    beforeEach(async () => {
                        [tx, recipt] = await txExec(
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
                            .withArgs(
                                contract.address,
                                verifierSideA1.address,
                                num
                            );
                    });

                    it("Should emit vNFT Transfer event", async () => {
                        await expect(tx)
                            .to.emit(foreVerifiers, "Transfer")
                            .withArgs(
                                contract.address,
                                verifierSideA1.address,
                                0
                            );
                    });
                });

                describe("Withdraw reward (incorrect verification)", () => {
                    let tx: ContractTransaction;
                    let recipt: ContractReceipt;
                    const num = ethers.utils
                        .parseEther("750")
                        .div(ethers.BigNumber.from("2"));

                    beforeEach(async () => {
                        [tx, recipt] = await txExec(
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
                            .withArgs(
                                contract.address,
                                ethers.constants.AddressZero,
                                3
                            );
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
                .predict(ethers.utils.parseEther("500"), true);
            await contract
                .connect(predictorSideA2)
                .predict(ethers.utils.parseEther("500"), true);
            await contract
                .connect(predictorSideB1)
                .predict(ethers.utils.parseEther("1000"), false);
            await contract
                .connect(predictorSideB2)
                .predict(ethers.utils.parseEther("2000"), false);

            await timetravel(blockTimestamp + 300000 + 1);
            await executeInSingleBlock(() => [
                contract.connect(verifierSideA1).verify(0, false),
                contract.connect(verifierSideA2).verify(1, false),
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
                beforeEach(async () => {
                    await timetravel(blockTimestamp + 4000000);

                    await contract.connect(marketCreator).closeMarket();
                });

                it("Should calculate reward", async () => {
                    expect(
                        await contract
                            .connect(predictorSideB2)
                            .calculatePredictionReward(predictorSideB2.address)
                    ).to.be.equal(
                        ethers.utils.parseEther("3166.666666666666666666")
                    );
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
                    let recipt: ContractReceipt;
                    beforeEach(async () => {
                        [tx, recipt] = await txExec(
                            contract
                                .connect(predictorSideB2)
                                .withdrawPredictionReward(
                                    predictorSideB2.address
                                )
                        );
                    });

                    it("Should emit WithdrawReward event", async () => {
                        await expect(tx)
                            .to.emit(
                                { ...marketLib, address: contract.address },
                                "WithdrawReward"
                            )
                            .withArgs(
                                predictorSideB2.address,
                                1,
                                ethers.utils.parseEther(
                                    "3166.666666666666666666"
                                )
                            );
                    });

                    it("Should emit Fore token Transfer event", async () => {
                        await expect(tx)
                            .to.emit(foreToken, "Transfer")
                            .withArgs(
                                contract.address,
                                predictorSideB2.address,
                                ethers.utils.parseEther(
                                    "3166.666666666666666666"
                                )
                            );
                    });

                    it("Should revert when rewards already withdrawn", async () => {
                        await expect(
                            contract
                                .connect(predictorSideB2)
                                .withdrawPredictionReward(
                                    predictorSideB2.address
                                )
                        ).to.be.revertedWith("AlreadyWithdrawn");
                    });

                    it("Should calculate 0 reward", async () => {
                        expect(
                            await contract
                                .connect(predictorSideB2)
                                .calculatePredictionReward(
                                    predictorSideB2.address
                                )
                        ).to.be.equal(0);
                    });
                });

                describe("after withdrawn with exhausted token balance", () => {
                    let tx: ContractTransaction;
                    let recipt: ContractReceipt;
                    beforeEach(async () => {
                        await foreToken.setVariable("_balances", {
                            [contract.address]: ethers.utils.parseEther("3000"),
                        });

                        [tx, recipt] = await txExec(
                            contract
                                .connect(predictorSideB2)
                                .withdrawPredictionReward(
                                    predictorSideB2.address
                                )
                        );
                    });

                    it("Should emit WithdrawReward event", async () => {
                        await expect(tx)
                            .to.emit(
                                { ...marketLib, address: contract.address },
                                "WithdrawReward"
                            )
                            .withArgs(
                                predictorSideB2.address,
                                1,
                                ethers.utils.parseEther(
                                    "3166.666666666666666666"
                                )
                            );
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
                .predict(ethers.utils.parseEther("500"), true);
            await contract
                .connect(predictorSideA2)
                .predict(ethers.utils.parseEther("500"), true);
            await contract
                .connect(predictorSideB1)
                .predict(ethers.utils.parseEther("1000"), false);
            await contract
                .connect(predictorSideB2)
                .predict(ethers.utils.parseEther("2000"), false);

            await timetravel(blockTimestamp + 300000 + 1);
            await executeInSingleBlock(() => [
                contract.connect(verifierSideA1).verify(0, true),
                contract.connect(verifierSideA2).verify(1, false),
            ]);
        });

        describe("Prediction reward", () => {
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
                    ).to.be.equal(ethers.utils.parseEther("475"));
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
                    let recipt: ContractReceipt;
                    beforeEach(async () => {
                        [tx, recipt] = await txExec(
                            contract
                                .connect(predictorSideA1)
                                .withdrawPredictionReward(
                                    predictorSideA1.address
                                )
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
                                ethers.utils.parseEther("475")
                            );
                    });

                    it("Should emit Fore token Transfer event", async () => {
                        await expect(tx)
                            .to.emit(foreToken, "Transfer")
                            .withArgs(
                                contract.address,
                                predictorSideA1.address,
                                ethers.utils.parseEther("475")
                            );
                    });

                    it("Should revert when rewards already withdrawn", async () => {
                        await expect(
                            contract
                                .connect(predictorSideA1)
                                .withdrawPredictionReward(
                                    predictorSideA1.address
                                )
                        ).to.be.revertedWith("AlreadyWithdrawn");
                    });

                    it("Should calculate 0 reward", async () => {
                        expect(
                            await contract
                                .connect(predictorSideA1)
                                .calculatePredictionReward(
                                    predictorSideA1.address
                                )
                        ).to.be.equal(0);
                    });
                });
            });
        });
    });

    describe("Invalid market", () => {
        beforeEach(async () => {
            await contract
                .connect(predictorSideA1)
                .predict(ethers.utils.parseEther("500"), true);

            await timetravel(blockTimestamp + 300005);

            await contract.connect(verifierSideA1).verify(0, true);
        });

        describe("Market creator reward", () => {
            it("Should rewert with OnlyForValidMarkets", async () => {
                await expect(
                    contract.connect(marketCreator).marketCreatorFeeWithdraw()
                ).to.be.revertedWith("OnlyForValidMarkets");
            });
        });

        describe("Prediction reward", () => {
            it("Should return 0 reward", async () => {
                expect(
                    await contract
                        .connect(verifierSideA1)
                        .calculatePredictionReward(verifierSideA1.address)
                ).to.be.equal(ethers.utils.parseEther("0"));
            });
        });
    });
});
