import { ForeMarket } from "@/ForeMarket";
import { ForeMarkets } from "@/ForeMarkets";
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
    assertIsAvailableOnlyForOwner,
    deployContractAs,
    deployLibrary,
    deployMockedContract,
    impersonateContract,
    txExec,
} from "../helpers/utils";

describe("ForeMarket / Initialization", () => {
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

        // deployment of market using factory account
        contract = await deployContractAs<ForeMarket>(
            foreMarketsAccount,
            "ForeMarket"
        );

        const previousBlock = await ethers.provider.getBlock("latest");
        blockTimestamp = previousBlock.timestamp;
    });

    it("Should allow to execute only by fore markets", async () => {
        await assertIsAvailableOnlyForOwner(
            async (account) => {
                return contract
                    .connect(account)
                    .initialize(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                        owner.address,
                        ethers.utils.parseEther("1"),
                        ethers.utils.parseEther("2"),
                        blockTimestamp + 100000,
                        blockTimestamp + 200000,
                        0
                    );
            },
            foreMarketsAccount,
            "ForeMarket: FORBIDDEN"
        );
    });

    describe("successfully", () => {
        let tx: ContractTransaction;
        let recipt: ContractReceipt;

        beforeEach(async () => {
            [tx, recipt] = await txExec(
                contract
                    .connect(foreMarketsAccount)
                    .initialize(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                        owner.address,
                        ethers.utils.parseEther("1"),
                        ethers.utils.parseEther("2"),
                        blockTimestamp + 100000,
                        blockTimestamp + 200000,
                        0
                    )
            );
        });

        it("Should emit MarketInitialized event", async () => {
            await expect(tx)
                .to.emit(contract, "MarketInitialized")
                .withArgs(BigNumber.from(0));
        });

        it("Should return proper protocol config address", async () => {
            expect(await contract.protocolConfig()).to.be.equal(
                protocolConfig.address
            );
        });

        it("Should return proper market config address", async () => {
            expect(await contract.marketConfig()).to.be.equal(
                await protocolConfig.marketConfig()
            );
        });

        it("Should return proper FORE verifiers address", async () => {
            expect(await contract.foreVerifiers()).to.be.equal(
                foreVerifiers.address
            );
        });

        it("Should return proper FORE token address", async () => {
            expect(await contract.foreToken()).to.be.equal(foreToken.address);
        });

        it("Should return proper merket struct", async () => {
            expect(await contract.market()).to.be.eql([
                "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("2"),
                BigNumber.from(0),
                BigNumber.from(0),
                BigNumber.from(blockTimestamp + 100000),
                BigNumber.from(blockTimestamp + 200000),
                BigNumber.from(0),
                0,
            ]);
        });

        it("Should emit Predict events", async () => {
            await expect(tx)
                .to.emit(contract, "Predict")
                .withArgs(owner.address, true, ethers.utils.parseEther("1"));

            await expect(tx)
                .to.emit(contract, "Predict")
                .withArgs(owner.address, false, ethers.utils.parseEther("2"));
        });

        it("Should update predictions state", async () => {
            expect(await contract.predictionsA(owner.address)).to.be.equal(
                ethers.utils.parseEther("1")
            );
            expect(await contract.predictionsB(owner.address)).to.be.equal(
                ethers.utils.parseEther("2")
            );
        });

        it("Should return null privilege NFT struct", async () => {
            expect(await contract.privilegeNft()).to.be.eql([
                "0x0000000000000000000000000000000000000000",
                BigNumber.from(0),
                false,
                false,
            ]);
        });

        it("Should return null dispute struct", async () => {
            expect(await contract.dispute()).to.be.eql([
                "0x0000000000000000000000000000000000000000",
                false,
                false,
            ]);
        });

        it("Should return initial verificationHeight", async () => {
            expect(await contract.verificationHeight()).to.be.equal(0);
        });
    });

    describe("with 0 A side", () => {
        let tx: ContractTransaction;
        let recipt: ContractReceipt;

        beforeEach(async () => {
            [tx, recipt] = await txExec(
                contract
                    .connect(foreMarketsAccount)
                    .initialize(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                        owner.address,
                        0,
                        ethers.utils.parseEther("2"),
                        blockTimestamp + 100000,
                        blockTimestamp + 200000,
                        0
                    )
            );
        });

        it("Should emit Predict events", async () => {
            await expect(tx)
                .to.emit(contract, "Predict")
                .withArgs(owner.address, false, ethers.utils.parseEther("2"));
        });

        it("Should update predictions state", async () => {
            expect(await contract.predictionsA(owner.address)).to.be.equal(0);
            expect(await contract.predictionsB(owner.address)).to.be.equal(
                ethers.utils.parseEther("2")
            );
        });
    });

    describe("with 0 B side", () => {
        let tx: ContractTransaction;
        let recipt: ContractReceipt;

        beforeEach(async () => {
            [tx, recipt] = await txExec(
                contract
                    .connect(foreMarketsAccount)
                    .initialize(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                        owner.address,
                        ethers.utils.parseEther("1"),
                        0,
                        blockTimestamp + 100000,
                        blockTimestamp + 200000,
                        0
                    )
            );
        });

        it("Should emit Predict events", async () => {
            await expect(tx)
                .to.emit(contract, "Predict")
                .withArgs(owner.address, true, ethers.utils.parseEther("1"));
        });

        it("Should update predictions state", async () => {
            expect(await contract.predictionsA(owner.address)).to.be.equal(
                ethers.utils.parseEther("1")
            );
            expect(await contract.predictionsB(owner.address)).to.be.equal(0);
        });
    });
});
