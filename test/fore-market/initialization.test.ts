import { BasicMarket } from "@/BasicMarket";
import { ForeProtocol, MarketCreatedEvent } from "@/ForeProtocol";
import { BasicFactory } from "@/BasicFactory";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers } from "@/ForeVerifiers";
import { MarketLib } from "@/MarketLib";
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
    deployContractAs,
    deployLibrary,
    deployMockedContract,
    impersonateContract,
    txExec,
} from "../helpers/utils";

describe("BasicMarket / Initialization", () => {
    let owner: SignerWithAddress;
    let foundationWallet: SignerWithAddress;
    let highGuardAccount: SignerWithAddress;
    let marketplaceContract: SignerWithAddress;
    let foreProtocolAccount: Signer;
    let basicFactoryAccount: Signer;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

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
        ] = await ethers.getSigners();

        // deploy library
        marketLib = await deployLibrary("MarketLib", [
            "BasicMarket",
            "BasicFactory",
        ]);

        // preparing dependencies
        foreToken = await deployMockedContract<ForeToken>("ForeToken");
        foreVerifiers = await deployMockedContract<ForeVerifiers>(
            "ForeVerifiers"
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

        // preparing fore protocol
        foreProtocol = await deployMockedContract<ForeProtocol>(
            "ForeProtocol",
            protocolConfig.address
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

        // deployment of market using factory account
        contract = await deployContractAs<BasicMarket>(
            basicFactoryAccount,
            "BasicMarket"
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
                        foreProtocol.address,
                        blockTimestamp + 100000,
                        blockTimestamp + 200000,
                        0
                    );
            },
            basicFactoryAccount,
            "BasicMarket: Only Factory"
        );
    });

    describe("successfully", () => {
        let tx: ContractTransaction;
        let recipt: ContractReceipt;

        beforeEach(async () => {
            [tx, recipt] = await txExec(
                contract
                    .connect(basicFactoryAccount)
                    .initialize(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                        owner.address,
                        ethers.utils.parseEther("1"),
                        ethers.utils.parseEther("2"),
                        foreProtocol.address,
                        blockTimestamp + 100000,
                        blockTimestamp + 200000,
                        0
                    )
            );
        });

        it("Should emit MarketInitialized event", async () => {
            await expect(tx)
                .to.emit(
                    { ...marketLib, address: contract.address },
                    "MarketInitialized"
                )
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

        it("Should return proper market hash", async () => {
            expect(await contract.marketHash()).to.be.equal(
                "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab"
            );
        });

        it("Should return proper market struct", async () => {
            expect(await contract.marketInfo()).to.be.eql([
                ethers.utils.parseEther("1"), // side A
                ethers.utils.parseEther("2"), // side B
                BigNumber.from(0), // verified A
                BigNumber.from(0), // verified B
                ethers.constants.AddressZero, // dispute creator
                BigNumber.from(blockTimestamp + 100000), // endPredictionTimestamp
                BigNumber.from(blockTimestamp + 200000), // startVerificationTimestamp
                0, // result
                false, // confirmed
                false, // solved
            ]);
        });

        it("Should emit Predict events", async () => {
            await expect(tx)
                .to.emit({ ...marketLib, address: contract.address }, "Predict")
                .withArgs(owner.address, true, ethers.utils.parseEther("1"));

            await expect(tx)
                .to.emit({ ...marketLib, address: contract.address }, "Predict")
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
                    .connect(basicFactoryAccount)
                    .initialize(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                        owner.address,
                        0,
                        ethers.utils.parseEther("2"),
                        foreProtocol.address,
                        blockTimestamp + 100000,
                        blockTimestamp + 200000,
                        0
                    )
            );
        });

        it("Should emit Predict events", async () => {
            await expect(tx)
                .to.emit({ ...marketLib, address: contract.address }, "Predict")
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
                    .connect(basicFactoryAccount)
                    .initialize(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                        owner.address,
                        ethers.utils.parseEther("1"),
                        0,
                        foreProtocol.address,
                        blockTimestamp + 100000,
                        blockTimestamp + 200000,
                        0
                    )
            );
        });

        it("Should emit Predict events", async () => {
            await expect(tx)
                .to.emit({ ...marketLib, address: contract.address }, "Predict")
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
