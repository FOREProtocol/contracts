import { BasicMarket } from "@/BasicMarket";
import { ForeProtocol, MarketCreatedEvent } from "@/ForeProtocol";
import { BasicFactory } from "@/BasicFactory";
import { ForeToken } from "@/ForeToken";
import { MarketLib } from "@/MarketLib";
import { ForeVerifiers } from "@/ForeVerifiers";
import { ProtocolConfig } from "@/ProtocolConfig";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";
import { ContractReceipt } from "@ethersproject/contracts/src.ts/index";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, ContractTransaction, Signer } from "ethers";
import { ethers } from "hardhat";
import {
    assertIsAvailableOnlyForOwner,
    attachContract,
    deployContract,
    deployLibrary,
    deployMockedContract,
    executeInSingleBlock,
    findEvent,
    impersonateContract,
    sendERC20Tokens,
    timetravel,
    txExec,
    waitForTxs,
} from "../helpers/utils";

describe("BasicMarket / Dispute", () => {
    let owner: SignerWithAddress;
    let foundationWallet: SignerWithAddress;
    let highGuardAccount: SignerWithAddress;
    let marketplaceContract: SignerWithAddress;
    let foreProtocolAccount: Signer;
    let basicFactoryAccount: Signer;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let carol: SignerWithAddress;
    let dave: SignerWithAddress;
    let marketLib: MarketLib;

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
            alice,
            bob,
            carol,
            dave,
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
            ethers.utils.parseEther("20")
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
            [alice.address]: ethers.utils.parseEther("10000"),
            [bob.address]: ethers.utils.parseEther("10000"),
            [carol.address]: ethers.utils.parseEther("10000"),
            [dave.address]: ethers.utils.parseEther("999"),
        });

        const previousBlock = await ethers.provider.getBlock("latest");
        blockTimestamp = previousBlock.timestamp;

        await txExec(
            foreToken
                .connect(alice)
                .approve(
                    basicFactory.address,
                    ethers.utils.parseUnits("1000", "ether")
                )
        );
        // creating market
        const marketHash =
            "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab";
        const [tx, recipt] = await txExec(
            basicFactory
                .connect(alice)
                .createMarket(
                    marketHash,
                    alice.address,
                    ethers.utils.parseEther("50"),
                    ethers.utils.parseEther("50"),
                    BigNumber.from(blockTimestamp + 200000),
                    BigNumber.from(blockTimestamp + 300000)
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
                .connect(alice)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("1000", "ether")
                ),
            foreToken
                .connect(bob)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("1000", "ether")
                ),
            foreToken
                .connect(carol)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("1000", "ether")
                ),
            foreToken
                .connect(dave)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("1000", "ether")
                ),
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
        it("Should return null dispute", async () => {
            expect(await contract.marketInfo()).to.be.eql([
                ethers.utils.parseEther("50"), // side A
                ethers.utils.parseEther("50"), // side B
                ethers.utils.parseEther("0"), // verified A
                ethers.utils.parseEther("0"), // verified B
                ethers.constants.AddressZero, // dispute creator
                BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                0, // result
                false, // confirmed
                false, // solved
            ]);
        });

        it("Should revert if executed before dispute period", async () => {
            await expect(
                contract
                    .connect(bob)
                    .openDispute(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab"
                    )
            ).to.revertedWith("DisputePeriodIsNotStartedYet");
        });
    });

    describe("after market verified (but before dispute period start)", () => {
        beforeEach(async () => {
            await timetravel(blockTimestamp + 300000 + 1);
            await executeInSingleBlock(() => [
                contract.connect(alice).verify(0, false),
                contract.connect(bob).verify(1, false),
                contract.connect(carol).verify(2, false),
            ]);
        });

        describe("after dispute period start", () => {
            beforeEach(async () => {
                await contract.connect(bob);
                await timetravel(blockTimestamp + 300000 + 86400 + 1);
            });

            it("Should fail without required amount of funds", async () => {
                await expect(
                    contract
                        .connect(dave)
                        .openDispute(
                            "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab"
                        )
                ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
            });

            describe("sucessfully", () => {
                let tx: ContractTransaction;
                let recipt: ContractReceipt;

                beforeEach(async () => {
                    [tx, recipt] = await txExec(
                        contract
                            .connect(alice)
                            .openDispute(
                                "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab"
                            )
                    );
                });

                it("Should emit ERC20 Transfer event", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            alice.address,
                            contract.address,
                            ethers.utils.parseEther("1000")
                        );
                });

                it("Should emit OpenDispute event", async () => {
                    await expect(tx)
                        .to.emit(
                            { ...marketLib, address: contract.address },
                            "OpenDispute"
                        )
                        .withArgs(alice.address);
                });

                it("Should update dispute state", async () => {
                    expect(await contract.marketInfo()).to.be.eql([
                        ethers.utils.parseEther("50"), // side A
                        ethers.utils.parseEther("50"), // side B
                        ethers.utils.parseEther("0"), // verified A
                        ethers.utils.parseEther("50"), // verified B
                        alice.address, // dispute creator
                        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                        0, // result
                        false, // confirmed
                        false, // solved
                    ]);
                });
            });
        });

        it("Should be able to open dispute", async () => {
            await txExec(
                contract
                    .connect(alice)
                    .openDispute(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab"
                    )
            );
        });
    });

    describe("after dispute period end with invalid market", () => {
        let tx: ContractTransaction;
        let recipt: ContractReceipt;
        beforeEach(async () => {
            await timetravel(blockTimestamp + 300000 + 86400 + 86400 + 1);
            [tx, recipt] = await txExec(
                contract
                    .connect(bob)
                    .openDispute(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab"
                    )
            );
        });

        it("Should close market with invalid status", async () => {
            await expect(tx)
                .to.emit(
                    { ...marketLib, address: contract.address },
                    "CloseMarket"
                )
                .withArgs(4);

            // await contract
            //     .connect(bob)
            //     .openDispute(
            //         "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab"
            //     );
        });
    });

    describe("with A winning", () => {
        beforeEach(async () => {
            await timetravel(blockTimestamp + 300000 + 1);
            await executeInSingleBlock(() => [
                contract.connect(alice).verify(0, true),
                contract.connect(bob).verify(1, true),
                contract.connect(carol).verify(2, true),
            ]);
        });

        describe("with open dispute", () => {
            beforeEach(async () => {
                await timetravel(blockTimestamp + 300000 + 86400 + 1);
                await txExec(
                    contract
                        .connect(alice)
                        .openDispute(
                            "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab"
                        )
                );
            });

            it("Only HG can resolve dispute", async () => {
                await assertIsAvailableOnlyForOwner(
                    (account) => contract.connect(account).resolveDispute(1),
                    highGuardAccount,
                    "HighGuardOnly"
                );
            });

            it("Should not be possible to close market before dispute resolved", async () => {
                await expect(
                    contract.connect(bob).closeMarket()
                ).to.be.revertedWith("DisputeNotSolvedYet");
            });

            it("Should not be possible to close market before dispute resolved even after long time", async () => {
                await timetravel(blockTimestamp + 10000000);
                await expect(
                    contract.connect(bob).closeMarket()
                ).to.be.revertedWith("DisputeNotSolvedYet");
            });

            describe("with resolved dispute (result confirmed - dispute rejected)", () => {
                let tx: ContractTransaction;
                let recipt: ContractReceipt;

                beforeEach(async () => {
                    [tx, recipt] = await txExec(
                        contract.connect(highGuardAccount).resolveDispute(1)
                    );
                });

                it("Should transfer fee to foundation", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            foundationWallet.address,
                            ethers.utils.parseEther("1.5")
                        );
                });

                it("Should burn fee", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            "0x0000000000000000000000000000000000000000",
                            ethers.utils.parseEther("1")
                        );
                });

                it("Should transfer dispute creator fee to HG", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            highGuardAccount.address,
                            ethers.utils.parseEther("1000")
                        );
                });

                it("Should update dispute state", async () => {
                    expect(await contract.marketInfo()).to.be.eql([
                        ethers.utils.parseEther("50"), // side A
                        ethers.utils.parseEther("50"), // side B
                        ethers.utils.parseEther("50"), // verified A
                        ethers.utils.parseEther("0"), // verified B
                        alice.address, // dispute creator
                        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                        1, // result
                        false, // dispute confirmed
                        true, // dispute solved
                    ]);
                });

                it("Should emit CloseMarket event", async () => {
                    await expect(tx)
                        .to.emit(
                            { ...marketLib, address: contract.address },
                            "CloseMarket"
                        )
                        .withArgs(1);
                });

                it("Should update market state", async () => {
                    expect(await contract.marketInfo()).to.be.eql([
                        ethers.utils.parseEther("50"), // side A
                        ethers.utils.parseEther("50"), // side B
                        ethers.utils.parseEther("50"), // verified A
                        ethers.utils.parseEther("0"), // verified B
                        alice.address, // dispute creator
                        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                        1, // result
                        false, // confirmed
                        true, // solved
                    ]);
                });
            });

            describe("with resolved dispute (result rejected - dispute accepted)", () => {
                let tx: ContractTransaction;
                let recipt: ContractReceipt;

                beforeEach(async () => {
                    [tx, recipt] = await txExec(
                        contract.connect(highGuardAccount).resolveDispute(2)
                    );
                });

                it("Should transfer fee to foundation", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            foundationWallet.address,
                            ethers.utils.parseEther("1.5")
                        );
                });

                it("Should burn fee", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            "0x0000000000000000000000000000000000000000",
                            ethers.utils.parseEther("3")
                        );
                });

                it("Should return dispute fee to dispute creator", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            alice.address,
                            ethers.utils.parseEther("1000")
                        );
                });

                it("Should update dispute state", async () => {
                    expect(await contract.marketInfo()).to.be.eql([
                        ethers.utils.parseEther("50"), // side A
                        ethers.utils.parseEther("50"), // side B
                        ethers.utils.parseEther("50"), // verified A
                        ethers.utils.parseEther("0"), // verified B
                        alice.address, // dispute creator
                        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                        2, // result
                        true, // confirmed
                        true, // solved
                    ]);
                });

                it("Should emit CloseMarket event", async () => {
                    await expect(tx)
                        .to.emit(
                            { ...marketLib, address: contract.address },
                            "CloseMarket"
                        )
                        .withArgs(2);
                });

                it("Should update market state", async () => {
                    expect(await contract.marketInfo()).to.be.eql([
                        ethers.utils.parseEther("50"), // side A
                        ethers.utils.parseEther("50"), // side B
                        ethers.utils.parseEther("50"), // verified A
                        ethers.utils.parseEther("0"), // verified B
                        alice.address, // dispute creator
                        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                        2, // result
                        true, // confirmed
                        true, // solved
                    ]);
                });
            });

            describe("with resolved dispute (dispute confirmed - draw)", () => {
                let tx: ContractTransaction;
                let recipt: ContractReceipt;

                beforeEach(async () => {
                    [tx, recipt] = await txExec(
                        contract.connect(highGuardAccount).resolveDispute(3)
                    );
                });

                it("Should transfer fee to foundation", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            foundationWallet.address,
                            ethers.utils.parseEther("1.5")
                        );
                });

                it("Should burn fee", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            "0x0000000000000000000000000000000000000000",
                            ethers.utils.parseEther("1")
                        );
                });

                it("Should transfer verification fee to high guard", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            highGuardAccount.address,
                            ethers.utils.parseEther("1")
                        );
                });

                it("Should return dispute fee to dispute creator", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            alice.address,
                            ethers.utils.parseEther("1000")
                        );
                });

                it("Should transfer verification fee to dispute creator", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            alice.address,
                            ethers.utils.parseEther("1")
                        );
                });

                it("Should update dispute state", async () => {
                    expect(await contract.marketInfo()).to.be.eql([
                        ethers.utils.parseEther("50"), // side A
                        ethers.utils.parseEther("50"), // side B
                        ethers.utils.parseEther("50"), // verified A
                        ethers.utils.parseEther("0"), // verified B
                        alice.address, // dispute creator
                        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                        3, // result
                        true, // confirmed
                        true, // solved
                    ]);
                });

                it("Should emit CloseMarket event", async () => {
                    await expect(tx)
                        .to.emit(
                            { ...marketLib, address: contract.address },
                            "CloseMarket"
                        )
                        .withArgs(3);
                });

                it("Should update market state", async () => {
                    expect(await contract.marketInfo()).to.be.eql([
                        ethers.utils.parseEther("50"), // side A
                        ethers.utils.parseEther("50"), // side B
                        ethers.utils.parseEther("50"), // verified A
                        ethers.utils.parseEther("0"), // verified B
                        alice.address, // dispute creator
                        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                        3, // result
                        true, // confirmed
                        true, // solved
                    ]);
                });
            });
        });
    });

    describe("with draw", () => {
        beforeEach(async () => {
            await timetravel(blockTimestamp + 300000 + 1);
            await executeInSingleBlock(() => [
                contract.connect(alice).verify(0, true),
                contract.connect(bob).verify(1, false),
            ]);
        });

        describe("with open dispute", () => {
            beforeEach(async () => {
                await timetravel(blockTimestamp + 300000 + 86400 + 1);
                await txExec(
                    contract
                        .connect(alice)
                        .openDispute(
                            "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab"
                        )
                );
            });

            describe("with resolved dispute (result DRAW - dispute rejected)", () => {
                let tx: ContractTransaction;
                let recipt: ContractReceipt;

                beforeEach(async () => {
                    [tx, recipt] = await txExec(
                        contract.connect(highGuardAccount).resolveDispute(3)
                    );
                });

                it("Should transfer foundation", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            foundationWallet.address,
                            ethers.utils.parseEther("1.5")
                        );
                });

                it("Should transfer burn", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            "0x0000000000000000000000000000000000000000",
                            ethers.utils.parseEther("2")
                        );
                });

                it("Should transfer dispute creator fee to HG", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            highGuardAccount.address,
                            ethers.utils.parseEther("1000")
                        );
                });

                it("Should transfer verification fee to HG", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            highGuardAccount.address,
                            ethers.utils.parseEther("1")
                        );
                });

                it("Should update dispute state", async () => {
                    expect(await contract.marketInfo()).to.be.eql([
                        ethers.utils.parseEther("50"), // side A
                        ethers.utils.parseEther("50"), // side B
                        ethers.utils.parseEther("20"), // verified A
                        ethers.utils.parseEther("20"), // verified B
                        alice.address, // dispute creator
                        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                        3, // result
                        false, // confirmed
                        true, // solved
                    ]);
                });

                it("Should emit CloseMarket event", async () => {
                    await expect(tx)
                        .to.emit(
                            { ...marketLib, address: contract.address },
                            "CloseMarket"
                        )
                        .withArgs(3);
                });

                it("Should update market state", async () => {
                    expect(await contract.marketInfo()).to.be.eql([
                        ethers.utils.parseEther("50"), // side A
                        ethers.utils.parseEther("50"), // side B
                        ethers.utils.parseEther("20"), // verified A
                        ethers.utils.parseEther("20"), // verified B
                        alice.address, // dispute creator
                        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                        3, // result
                        false, // confirmed
                        true, // solved
                    ]);
                });
            });
        });
    });

    describe("with closed market", () => {
        beforeEach(async () => {
            await timetravel(blockTimestamp + 300000 + 86400 + 86400 + 1);
            await txExec(contract.connect(bob).closeMarket());
        });

        it("Should not be able to open dispute", async () => {
            await expect(
                contract
                    .connect(alice)
                    .openDispute(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab"
                    )
            ).to.be.revertedWith("MarketIsClosed");
        });
    });
});
