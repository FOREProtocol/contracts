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
        await txExec(foreToken.setProtocol(foreProtocol.address));
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

        // create verifiers tokens
        await executeInSingleBlock(() => [
            foreProtocol.connect(owner).mintVerifier(verifierSideA1.address),
            foreProtocol.connect(owner).mintVerifier(verifierSideA2.address),
            foreProtocol.connect(owner).mintVerifier(verifierSideB1.address),
            foreProtocol.connect(owner).mintVerifier(verifierSideB2.address),
        ]);

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

            contract.connect(marketCreator).closeMarket();

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
            let recipt: ContractReceipt;
            beforeEach(async () => {
                await timetravel(blockTimestamp + 4000000);

                contract.connect(marketCreator).closeMarket();

                [tx, recipt] = await txExec(
                    contract.connect(marketCreator).marketCreatorFeeWithdraw()
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
                await timetravel(blockTimestamp + 300005 + 1800);
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
                expect(await contract.calculateVerificationReward(1)).to.be.eql(
                    [ethers.utils.parseEther("0"), num2, num2, true]
                );
                expect(await contract.calculateVerificationReward(2)).to.be.eql(
                    [ethers.utils.parseEther("0"), num2, num2, true]
                );
                expect(await contract.calculateVerificationReward(3)).to.be.eql(
                    [ethers.utils.parseEther("0"), num2, num2, true]
                );
                expect(await contract.calculateVerificationReward(0)).to.be.eql(
                    [
                        num,
                        ethers.utils.parseEther("0"),
                        ethers.utils.parseEther("0"),
                        false,
                    ]
                );
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
                        .withArgs(contract.address, verifierSideB2.address, 3);
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
                            .connect(verifierSideB1)
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
        });

        describe("after closing", () => {
            let tx: ContractTransaction;
            let recipt: ContractReceipt;
            beforeEach(async () => {
                await timetravel(blockTimestamp + 4000000);

                contract.connect(marketCreator).closeMarket();
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
                expect(await contract.calculateVerificationReward(1)).to.be.eql(
                    [
                        num,
                        ethers.utils.parseEther("0"),
                        ethers.utils.parseEther("0"),
                        false,
                    ]
                );
                expect(await contract.calculateVerificationReward(2)).to.be.eql(
                    [
                        num,
                        ethers.utils.parseEther("0"),
                        ethers.utils.parseEther("0"),
                        false,
                    ]
                );
                expect(await contract.calculateVerificationReward(3)).to.be.eql(
                    [
                        num,
                        ethers.utils.parseEther("0"),
                        ethers.utils.parseEther("0"),
                        false,
                    ]
                );
                expect(await contract.calculateVerificationReward(0)).to.be.eql(
                    [
                        ethers.utils.parseEther("0"),
                        ethers.utils.parseEther("0"),
                        ethers.utils.parseEther("0"),
                        true,
                    ]
                );
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
                        .withArgs(contract.address, verifierSideA1.address, 0);
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
                            .withdrawVerificationReward(0, true)
                    );
                });

                it("Should emit Fore token Transfer event (burn)", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            foreVerifiers.address,
                            ethers.constants.AddressZero,
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
