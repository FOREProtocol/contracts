import { ForeMarket } from "@/ForeMarket";
import { ForeMarkets, MarketCreatedEvent } from "@/ForeMarkets";
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

describe("ForeMarket / Dispute", () => {
    let owner: SignerWithAddress;
    let foundationWallet: SignerWithAddress;
    let revenueWallet: SignerWithAddress;
    let highGuardAccount: SignerWithAddress;
    let marketplaceContract: SignerWithAddress;
    let foreMarketsAccount: Signer;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let carol: SignerWithAddress;
    let dave: SignerWithAddress;
    let marketLib: MarketLib;

    let protocolConfig: MockContract<ProtocolConfig>;
    let foreToken: MockContract<ForeToken>;
    let foreVerifiers: MockContract<ForeVerifiers>;
    let foreMarkets: MockContract<ForeMarkets>;
    let contract: ForeMarket;

    let blockTimestamp: number;

    beforeEach(async () => {
        [
            owner,
            foundationWallet,
            revenueWallet,
            highGuardAccount,
            marketplaceContract,
            alice,
            bob,
            carol,
            dave,
        ] = await ethers.getSigners();

        const newLocal = "ForeMarket";
        // deploy library
        marketLib = await deployLibrary("MarketLib", [newLocal, "ForeMarkets"]);

        // preparing dependencies
        foreToken = await deployMockedContract<ForeToken>("ForeToken");
        foreVerifiers = await deployMockedContract<ForeVerifiers>(
            "ForeVerifiers"
        );

        protocolConfig = await deployMockedContract<ProtocolConfig>(
            "ProtocolConfig",
            foundationWallet.address,
            revenueWallet.address,
            highGuardAccount.address,
            marketplaceContract.address,
            foreToken.address,
            foreVerifiers.address,
            ethers.utils.parseEther("10"),
            ethers.utils.parseEther("20")
        );

        // preparing fore markets (factory)
        foreMarkets = await deployMockedContract<ForeMarkets>(
            "ForeMarkets",
            protocolConfig.address
        );
        foreMarketsAccount = await impersonateContract(foreMarkets.address);

        // factory assignment
        await txExec(foreToken.setFactory(foreMarkets.address));
        await txExec(foreVerifiers.setFactory(foreMarkets.address));

        // sending funds
        await sendERC20Tokens(foreToken, {
            [alice.address]: ethers.utils.parseEther("10000"),
            [bob.address]: ethers.utils.parseEther("10000"),
            [carol.address]: ethers.utils.parseEther("10000"),
            [dave.address]: ethers.utils.parseEther("999"),
        });

        const previousBlock = await ethers.provider.getBlock("latest");
        blockTimestamp = previousBlock.timestamp;

        // creating market
        const [tx, recipt] = await txExec(
            foreMarkets
                .connect(alice)
                .createMarket(
                    "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                    alice.address,
                    ethers.utils.parseEther("50"),
                    ethers.utils.parseEther("50"),
                    BigNumber.from(blockTimestamp + 200000),
                    BigNumber.from(blockTimestamp + 300000)
                )
        );

        // attach to market
        const marketCreatedEvent = findEvent<MarketCreatedEvent>(
            recipt,
            "MarketCreated"
        );
        const marketAddress = marketCreatedEvent.args.market;

        contract = await attachContract<ForeMarket>(
            "ForeMarket",
            marketAddress
        );

        // create verifiers tokens
        await executeInSingleBlock(() => [
            foreMarkets.connect(owner).mintVerifier(alice.address),
            foreMarkets.connect(owner).mintVerifier(bob.address),
            foreMarkets.connect(owner).mintVerifier(carol.address),
            foreMarkets.connect(owner).mintVerifier(dave.address),
        ]);
    });

    describe("initial state", () => {
        it("Should return null dispute", async () => {
            expect(await contract.marketInfo()).to.be.eql([
                ethers.utils.parseEther("50"), // side A
                ethers.utils.parseEther("50"), // side B
                ethers.utils.parseEther("0"), // verified A
                ethers.utils.parseEther("0"), // verified B
                ethers.utils.parseEther("0"), // reserved
                ethers.constants.AddressZero, // privilege nft staker
                ethers.constants.AddressZero, // dispute creator
                BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                BigNumber.from(0), // privilege nft id
                0, // result
                false, // confirmed
                false, // solved
                false, // extended
            ]);
        });

        it("Should revert if executed before dispute period", async () => {
            await expect(contract.connect(bob).openDispute()).to.revertedWith(
                "DisputePeriodIsNotStartedYet"
            );
        });
    });

    describe("after dispute period start", () => {
        beforeEach(async () => {
            await timetravel(blockTimestamp + 300000 + 1800 + 1);
        });

        it("Should fail without required amount of funds", async () => {
            await expect(
                contract.connect(dave).openDispute()
            ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });

        describe("sucessfully", () => {
            let tx: ContractTransaction;
            let recipt: ContractReceipt;

            beforeEach(async () => {
                [tx, recipt] = await txExec(
                    contract.connect(alice).openDispute()
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
                    ethers.utils.parseEther("0"), // verified B
                    ethers.utils.parseEther("0"), // reserved
                    ethers.constants.AddressZero, // privilege nft staker
                    alice.address, // dispute creator
                    BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                    BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                    BigNumber.from(0), // privilege nft id
                    0, // result
                    false, // confirmed
                    false, // solved
                    false, // extended
                ]);
            });
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

        it("Should be able to open dispute", async () => {
            await txExec(contract.connect(alice).openDispute());
        });
    });

    describe("after dispute period end", () => {
        beforeEach(async () => {
            await timetravel(blockTimestamp + 300000 + 1800 + 1800 + 1);
        });

        it("Should revert trying to verify", async () => {
            await expect(contract.connect(bob).openDispute()).to.revertedWith(
                "DisputePeriodIsEnded"
            );
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
                await timetravel(blockTimestamp + 300000 + 1800 + 1);
                await txExec(contract.connect(alice).openDispute());
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

                it("Should transfer revenue", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            revenueWallet.address,
                            ethers.utils.parseEther("1")
                        );
                });

                it("Should transfer fee to foundation", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            revenueWallet.address,
                            ethers.utils.parseEther("1")
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
                        ethers.utils.parseEther("0"), // reserved
                        ethers.constants.AddressZero, // privilege nft staker
                        alice.address, // dispute creator
                        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                        BigNumber.from(0), // privilege nft id
                        1, // result
                        false, // dispute confirmed
                        true, // dispute solved
                        false, // extended
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
                        ethers.utils.parseEther("0"), // reserved
                        ethers.constants.AddressZero, // privilege nft staker
                        alice.address, // dispute creator
                        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                        BigNumber.from(0), // privilege nft id
                        1, // result
                        false, // confirmed
                        true, // solved
                        false, // extended
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

                it("Should transfer revenue fee", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            revenueWallet.address,
                            ethers.utils.parseEther("1")
                        );
                });

                it("Should transfer fee to foundation", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            revenueWallet.address,
                            ethers.utils.parseEther("1")
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
                        ethers.utils.parseEther("0"), // reserved
                        ethers.constants.AddressZero, // privilege nft staker
                        alice.address, // dispute creator
                        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                        BigNumber.from(0), // privilege nft id
                        2, // result
                        true, // confirmed
                        true, // solved
                        false, // extended
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
                        ethers.utils.parseEther("0"), // reserved
                        ethers.constants.AddressZero, // privilege nft staker
                        alice.address, // dispute creator
                        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                        BigNumber.from(0), // privilege nft id
                        2, // result
                        true, // confirmed
                        true, // solved
                        false, // extended
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

                it("Should transfer fee to revenue", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            revenueWallet.address,
                            ethers.utils.parseEther("1")
                        );
                });

                it("Should transfer fee to foundation", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            revenueWallet.address,
                            ethers.utils.parseEther("1")
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
                            ethers.utils.parseEther("0.75")
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
                            ethers.utils.parseEther("0.75")
                        );
                });

                it("Should update dispute state", async () => {
                    expect(await contract.marketInfo()).to.be.eql([
                        ethers.utils.parseEther("50"), // side A
                        ethers.utils.parseEther("50"), // side B
                        ethers.utils.parseEther("50"), // verified A
                        ethers.utils.parseEther("0"), // verified B
                        ethers.utils.parseEther("0"), // reserved
                        ethers.constants.AddressZero, // privilege nft staker
                        alice.address, // dispute creator
                        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                        BigNumber.from(0), // privilege nft id
                        3, // result
                        true, // confirmed
                        true, // solved
                        false, // extended
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
                        ethers.utils.parseEther("0"), // reserved
                        ethers.constants.AddressZero, // privilege nft staker
                        alice.address, // dispute creator
                        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                        BigNumber.from(0), // privilege nft id
                        3, // result
                        true, // confirmed
                        true, // solved
                        false, // extended
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
                await timetravel(blockTimestamp + 300000 + 1800 + 1);
                await txExec(contract.connect(alice).openDispute());
            });

            describe("with resolved dispute (result DRAW - dispute rejected)", () => {
                let tx: ContractTransaction;
                let recipt: ContractReceipt;

                beforeEach(async () => {
                    [tx, recipt] = await txExec(
                        contract.connect(highGuardAccount).resolveDispute(3)
                    );
                });

                it("Should transfer revenue", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            revenueWallet.address,
                            ethers.utils.parseEther("1")
                        );
                });

                it("Should transfer foundation", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            revenueWallet.address,
                            ethers.utils.parseEther("1")
                        );
                });

                it("Should transfer burn", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            contract.address,
                            "0x0000000000000000000000000000000000000000",
                            ethers.utils.parseEther("1.75")
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
                            ethers.utils.parseEther("0.75")
                        );
                });

                it("Should update dispute state", async () => {
                    expect(await contract.marketInfo()).to.be.eql([
                        ethers.utils.parseEther("50"), // side A
                        ethers.utils.parseEther("50"), // side B
                        ethers.utils.parseEther("20"), // verified A
                        ethers.utils.parseEther("20"), // verified B
                        ethers.utils.parseEther("0"), // reserved
                        ethers.constants.AddressZero, // privilege nft staker
                        alice.address, // dispute creator
                        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                        BigNumber.from(0), // privilege nft id
                        3, // result
                        false, // confirmed
                        true, // solved
                        false, // extended
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
                        ethers.utils.parseEther("0"), // reserved
                        ethers.constants.AddressZero, // privilege nft staker
                        alice.address, // dispute creator
                        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                        BigNumber.from(0), // privilege nft id
                        3, // result
                        false, // confirmed
                        true, // solved
                        false, // extended
                    ]);
                });
            });
        });
    });

    describe("with closed market", () => {
        beforeEach(async () => {
            await timetravel(blockTimestamp + 300000 + 1800 + 1800 + 1);
            await txExec(contract.connect(bob).closeMarket());
        });

        it("Should not be able to open dispute", async () => {
            await expect(
                contract.connect(alice).openDispute()
            ).to.be.revertedWith("MarketIsClosed");
        });
    });
});
