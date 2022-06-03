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
    findEvent,
    impersonateContract,
    timetravel,
    txExec,
} from "../helpers/utils";

describe("ForeMarket / Prediciting", () => {
    let owner: SignerWithAddress;
    let foundationWallet: SignerWithAddress;
    let revenueWallet: SignerWithAddress;
    let highGuardAccount: SignerWithAddress;
    let marketplaceContract: SignerWithAddress;
    let foreMarketsAccount: Signer;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

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

        // sending funds to Alice
        await txExec(
            foreToken
                .connect(owner)
                .transfer(alice.address, ethers.utils.parseEther("1000"))
        );

        const previousBlock = await ethers.provider.getBlock("latest");
        blockTimestamp = previousBlock.timestamp;

        // creating market
        const [tx, recipt] = await txExec(
            foreMarkets
                .connect(alice)
                .createMarket(
                    "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                    alice.address,
                    0,
                    0,
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
    });

    describe("initial state", () => {
        it("Should return proper market state", async () => {
            expect(await contract.market()).to.be.eql([
                "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                BigNumber.from(0),
                BigNumber.from(0),
                BigNumber.from(0),
                BigNumber.from(0),
                BigNumber.from(blockTimestamp + 200000),
                BigNumber.from(blockTimestamp + 300000),
                BigNumber.from(0),
                0,
            ]);
        });
    });

    it("Should revert without sufficient funds", async () => {
        await expect(
            contract.connect(bob).predict(ethers.utils.parseEther("2"), true)
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("Should revert with 0 stake", async () => {
        await expect(contract.connect(bob).predict(0, true)).to.be.revertedWith(
            "ForeMarket: Amount cant be zero"
        );
    });

    describe("successfully (vote on A)", async () => {
        let tx: ContractTransaction;
        let recipt: ContractReceipt;

        beforeEach(async () => {
            [tx, recipt] = await txExec(
                contract
                    .connect(alice)
                    .predict(ethers.utils.parseEther("2"), true)
            );
        });

        it("Should emit Predict event", async () => {
            await expect(tx)
                .to.emit(contract, "Predict")
                .withArgs(alice.address, true, ethers.utils.parseEther("2"));
        });

        it("Should emit Transfer (ERC20) event", async () => {
            await expect(tx)
                .to.emit(foreToken, "Transfer")
                .withArgs(
                    alice.address,
                    contract.address,
                    ethers.utils.parseEther("2")
                );
        });

        it("Should return proper market state", async () => {
            expect(await contract.market()).to.be.eql([
                "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                ethers.utils.parseEther("2"),
                BigNumber.from(0),
                BigNumber.from(0),
                BigNumber.from(0),
                BigNumber.from(blockTimestamp + 200000),
                BigNumber.from(blockTimestamp + 300000),
                BigNumber.from(0),
                0,
            ]);
        });
    });

    describe("successfully (vote on B)", async () => {
        let tx: ContractTransaction;
        let recipt: ContractReceipt;

        beforeEach(async () => {
            [tx, recipt] = await txExec(
                contract
                    .connect(alice)
                    .predict(ethers.utils.parseEther("3"), false)
            );
        });

        it("Should return proper market state", async () => {
            expect(await contract.market()).to.be.eql([
                "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                BigNumber.from(0),
                ethers.utils.parseEther("3"),
                BigNumber.from(0),
                BigNumber.from(0),
                BigNumber.from(blockTimestamp + 200000),
                BigNumber.from(blockTimestamp + 300000),
                BigNumber.from(0),
                0,
            ]);
        });
    });

    describe("after predicting period ended", () => {
        beforeEach(async () => {
            await timetravel(blockTimestamp + 200001);
        });

        it("Should revert if executed after end", async () => {
            await expect(
                contract
                    .connect(alice)
                    .predict(ethers.utils.parseEther("2"), true)
            ).to.revertedWith("ForeMarket: Prediction is closed");
        });
    });
});
