import { BasicMarket } from "@/BasicMarket";
import { ForeProtocol } from "@/ForeProtocol";
import { BasicFactory } from "@/BasicFactory";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers } from "@/ForeVerifiers";
import { MarketLib } from "@/MarketLib";
import { ProtocolConfig } from "@/ProtocolConfig";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract, ContractTransaction } from "ethers";
import { ethers, upgrades } from "hardhat";
import {
    attachContract,
    deployLibrary,
    deployMockedContract,
    deployMockedContractAs,
    timetravel,
    txExec,
} from "../helpers/utils";
import { MockERC20 } from "@/MockERC20";

describe("BasicMarket / Predicting", () => {
    let owner: SignerWithAddress;
    let foundationWallet: SignerWithAddress;
    let highGuardAccount: SignerWithAddress;
    let marketplaceContract: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let usdcHolder: SignerWithAddress;

    let protocolConfig: MockContract<ProtocolConfig>;
    let foreToken: MockContract<ForeToken>;
    let foreVerifiers: MockContract<ForeVerifiers>;
    let foreProtocol: MockContract<ForeProtocol>;
    let tokenRegistry: Contract;
    let usdcToken: MockERC20;
    let basicFactory: MockContract<BasicFactory>;
    let marketLib: MarketLib;
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
            usdcHolder,
        ] = await ethers.getSigners();

        // deploy library
        marketLib = await deployLibrary("MarketLib", [
            "BasicMarket",
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

        usdcToken = await deployMockedContractAs<MockERC20>(
            usdcHolder,
            "MockERC20",
            "USDC",
            "USD Coin",
            ethers.utils.parseEther("1000000")
        );

        // preparing token registry
        const contractFactory = await ethers.getContractFactory(
            "TokenIncentiveRegistry"
        );
        const tokens = [
            {
                tokenAddress: usdcToken.address,
                discountRate: 10,
            },
            {
                tokenAddress: foreToken.address,
                discountRate: 10,
            },
        ];
        tokenRegistry = await upgrades.deployProxy(contractFactory, [tokens]);

        basicFactory = await deployMockedContract<BasicFactory>(
            "BasicFactory",
            foreProtocol.address,
            tokenRegistry.address
        );

        // factory assignment
        await txExec(foreVerifiers.setProtocol(foreProtocol.address));

        // sending funds to Alice
        await txExec(
            foreToken
                .connect(owner)
                .transfer(alice.address, ethers.utils.parseEther("1000"))
        );
        await txExec(
            usdcToken
                .connect(usdcHolder)
                .transfer(alice.address, ethers.utils.parseEther("1000"))
        );

        await txExec(
            protocolConfig
                .connect(owner)
                .setFactoryStatus([basicFactory.address], [true])
        );

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
        await txExec(
            usdcToken
                .connect(alice)
                .approve(
                    basicFactory.address,
                    ethers.utils.parseUnits("1000", "ether")
                )
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
                    0,
                    0,
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
        await txExec(
            foreToken
                .connect(alice)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("1000", "ether")
                )
        );
        await txExec(
            usdcToken
                .connect(alice)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("1000", "ether")
                )
        );

        await txExec(
            foreToken
                .connect(bob)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("1000", "ether")
                )
        );
        await txExec(
            usdcToken
                .connect(bob)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("1000", "ether")
                )
        );
    });

    describe("initial state", () => {
        it("Should return proper market state", async () => {
            expect(await contract.marketInfo()).to.be.eql([
                BigNumber.from(0), // side A
                BigNumber.from(0), // side B
                BigNumber.from(0), // verified A
                BigNumber.from(0), // verified B
                ethers.constants.AddressZero, // dispute creator
                BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                0, // result
                false, // confirmed
                false, // solved
            ]);
        });
    });

    it("Should revert without sufficient funds", async () => {
        await expect(
            contract
                .connect(bob)
                .predict(ethers.utils.parseEther("2"), true, foreToken.address)
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("Should revert with 0 stake", async () => {
        await expect(
            contract.connect(bob).predict(0, true, foreToken.address)
        ).to.be.revertedWith("AmountCantBeZero");
    });

    describe("successfully (vote on A)", async () => {
        let tx: ContractTransaction;

        beforeEach(async () => {
            [tx] = await txExec(
                contract
                    .connect(alice)
                    .predict(
                        ethers.utils.parseEther("2"),
                        true,
                        foreToken.address
                    )
            );
        });

        it("Should emit Predict event", async () => {
            await expect(tx)
                .to.emit({ ...marketLib, address: contract.address }, "Predict")
                .withArgs(alice.address, true, ethers.utils.parseEther("2"));
        });

        // it("Should emit Transfer (ERC20) event", async () => {
        //     await expect(tx)
        //         .to.emit(foreToken, "Transfer")
        //         .withArgs(
        //             alice.address,
        //             contract.address,
        //             ethers.utils.parseEther("2")
        //         );
        // });

        it("Should return proper market state", async () => {
            expect(await contract.marketInfo()).to.be.eql([
                ethers.utils.parseEther("2"), // side A
                BigNumber.from(0), // side B
                BigNumber.from(0), // verified A
                BigNumber.from(0), // verified B
                ethers.constants.AddressZero, // dispute creator
                BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                0, // result
                false, // confirmed
                false, // solved
            ]);
        });
    });

    describe("successfully (vote on B)", async () => {
        let tx: ContractTransaction;

        beforeEach(async () => {
            [tx] = await txExec(
                contract
                    .connect(alice)
                    .predict(
                        ethers.utils.parseEther("3"),
                        false,
                        foreToken.address
                    )
            );
        });

        it("Should emit Predict event", async () => {
            await expect(tx)
                .to.emit({ ...marketLib, address: contract.address }, "Predict")
                .withArgs(alice.address, false, ethers.utils.parseEther("3"));
        });

        // it("Should emit Transfer (ERC20) event", async () => {
        //     await expect(tx)
        //         .to.emit(foreToken, "Transfer")
        //         .withArgs(
        //             alice.address,
        //             contract.address,
        //             ethers.utils.parseEther("3")
        //         );
        // });

        it("Should return proper market state", async () => {
            expect(await contract.marketInfo()).to.be.eql([
                ethers.utils.parseEther("0"), // side A
                ethers.utils.parseEther("3"), // side B
                BigNumber.from(0), // verified A
                BigNumber.from(0), // verified B
                ethers.constants.AddressZero, // dispute creator
                BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                0, // result
                false, // confirmed
                false, // solved
            ]);
        });
    });

    describe("should accept alternative asset", () => {
        let predictionFee: BigNumber;

        beforeEach(async () => {
            await txExec(
                contract
                    .connect(alice)
                    .predict(
                        ethers.utils.parseEther("2"),
                        true,
                        usdcToken.address
                    )
            );

            predictionFee = await contract.calculatePredictionFee(
                usdcToken.address,
                ethers.utils.parseEther("2")
            );
        });

        it("should transfer alternative asset to market contract", async () => {
            expect(await usdcToken.balanceOf(contract.address)).to.be.eql(
                ethers.utils.parseEther("2")
            );
        });

        it("should transfer prediction fee", async () => {
            expect(await usdcToken.balanceOf(owner.address)).to.be.eql(
                predictionFee
            );
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
                    .predict(
                        ethers.utils.parseEther("2"),
                        true,
                        foreToken.address
                    )
            ).to.revertedWith("PredictionPeriodIsAlreadyClosed");
        });
    });
});
