import { ForeMarket } from "@/ForeMarket";
import { ForeMarkets, MarketCreatedEvent } from "@/ForeMarkets";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers } from "@/ForeVerifiers";
import { ProtocolConfig } from "@/ProtocolConfig";
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
} from "../helpers/utils";

describe("ForeMarket / Closing", () => {
    let owner: SignerWithAddress;
    let foundationWallet: SignerWithAddress;
    let revenueWallet: SignerWithAddress;
    let highGuardAccount: SignerWithAddress;
    let marketplaceContract: SignerWithAddress;
    let foreMarketsAccount: Signer;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let carol: SignerWithAddress;

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
        ] = await ethers.getSigners();

        // deploy library
        await deployLibrary("MarketLib", ["ForeMarket", "ForeMarkets"]);

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
            [alice.address]: ethers.utils.parseEther("2000"),
            [bob.address]: ethers.utils.parseEther("2000"),
            [carol.address]: ethers.utils.parseEther("2000"),
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
                    ethers.utils.parseEther("70"),
                    ethers.utils.parseEther("30"),
                    blockTimestamp + 200000,
                    blockTimestamp + 200000
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
        ]);
    });

    describe("initial state", () => {
        it("Should revert if executed before dispute period end", async () => {
            await expect(
                contract.connect(bob).closeMarket()
            ).to.be.revertedWith("ForeMarket: Only after dispute");
        });
    });

    describe("verified side won", () => {
        beforeEach(async () => {
            await timetravel(blockTimestamp + 200000 + 1);

            await executeInSingleBlock(() => [
                contract.connect(alice).verify(0, true),
                contract.connect(bob).verify(1, true),
            ]);

            await timetravel(blockTimestamp + 200000 + 1800 + 1800 + 1);
        });

        // full market size: 100 FORE
        // to burn (1%) = 1 FORE
        // burn and ver (1% + 1.5%) / 2 = 1.25 FORE
        // revenue (1%) = 1 FORE
        // fundation (1%) = 1 FORE

        describe("successfully", () => {
            let tx: ContractTransaction;
            let recipt: ContractReceipt;

            beforeEach(async () => {
                [tx, recipt] = await txExec(
                    contract.connect(bob).closeMarket()
                );
            });

            it("Should emit ERC20 transfer event (revenue)", async () => {
                await expect(tx)
                    .to.emit(foreToken, "Transfer")
                    .withArgs(
                        contract.address,
                        revenueWallet.address,
                        ethers.utils.parseEther("1")
                    );
            });

            it("Should emit ERC20 transfer event (foundation)", async () => {
                await expect(tx)
                    .to.emit(foreToken, "Transfer")
                    .withArgs(
                        contract.address,
                        revenueWallet.address,
                        ethers.utils.parseEther("1")
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
                await expect(tx).to.emit(contract, "CloseMarket").withArgs(1);
            });

            it("Should update market state", async () => {
                expect(await contract.market()).to.be.eql([
                    "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                    ethers.utils.parseEther("70"),
                    ethers.utils.parseEther("30"),
                    ethers.utils.parseEther("30"),
                    ethers.utils.parseEther("0"),
                    BigNumber.from(blockTimestamp + 200000),
                    BigNumber.from(blockTimestamp + 200000),
                    BigNumber.from(0),
                    1,
                ]);
            });
        });
    });

    describe("with draw", () => {
        beforeEach(async () => {
            await timetravel(blockTimestamp + 200000 + 1);
            await executeInSingleBlock(() => [
                contract.connect(alice).verify(0, true),
                contract.connect(bob).verify(1, false),
            ]);

            await timetravel(blockTimestamp + 200000 + 1800 + 1800 + 1);
        });

        // full market size: 100 FORE
        // to burn (1%) = 1 FORE
        // burn and ver (1% + 1.5%) / 2 = 1.25 FORE
        // revenue (1%) = 1 FORE
        // fundation (1%) = 1 FORE

        describe("successfully", () => {
            let tx: ContractTransaction;
            let recipt: ContractReceipt;

            beforeEach(async () => {
                [tx, recipt] = await txExec(
                    contract.connect(bob).closeMarket()
                );
            });

            it("Should emit ERC20 transfer event (revenue)", async () => {
                await expect(tx)
                    .to.emit(foreToken, "Transfer")
                    .withArgs(
                        contract.address,
                        revenueWallet.address,
                        ethers.utils.parseEther("1")
                    );
            });

            it("Should emit ERC20 transfer event (foundation)", async () => {
                await expect(tx)
                    .to.emit(foreToken, "Transfer")
                    .withArgs(
                        contract.address,
                        revenueWallet.address,
                        ethers.utils.parseEther("1")
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
                await expect(tx).to.emit(contract, "CloseMarket").withArgs(3);
            });

            it("Should update market state", async () => {
                expect(await contract.market()).to.be.eql([
                    "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                    ethers.utils.parseEther("70"),
                    ethers.utils.parseEther("30"),
                    ethers.utils.parseEther("20"),
                    ethers.utils.parseEther("20"),
                    BigNumber.from(blockTimestamp + 200000),
                    BigNumber.from(blockTimestamp + 200000),
                    BigNumber.from(0),
                    3,
                ]);
            });
        });
    });

    describe("with closed market", () => {
        beforeEach(async () => {
            await timetravel(blockTimestamp + 200000 + 1800 + 1800 + 1);
            await txExec(contract.connect(bob).closeMarket());
        });

        it("Should not be possible to close market again", async () => {
            await expect(
                contract.connect(carol).closeMarket()
            ).to.be.revertedWith("ForeMarket: Market is closed");
        });
    });
});
