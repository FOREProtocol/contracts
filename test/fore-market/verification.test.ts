import { BasicMarket } from "@/BasicMarket";
import { ForeProtocol } from "@/ForeProtocol";
import { BasicFactory } from "@/BasicFactory";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers } from "@/ForeVerifiers";
import { ProtocolConfig } from "@/ProtocolConfig";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { MarketLib } from "@/MarketLib";
import { BigNumber, Contract, ContractTransaction } from "ethers";
import { ethers, upgrades } from "hardhat";
import { deployLibrary, executeInSingleBlock } from "../../test/helpers/utils";
import {
    attachContract,
    deployMockedContract,
    sendERC20Tokens,
    timetravel,
    txExec,
} from "../helpers/utils";
import { MockERC20 } from "@/MockERC20";

const sides = {
    A: true,
    B: false,
};

describe("BasicMarket / Verification", () => {
    let owner: SignerWithAddress;
    let foundationWallet: SignerWithAddress;
    let highGuardAccount: SignerWithAddress;
    let marketplaceContract: SignerWithAddress;
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
    let tokenRegistry: Contract;
    let usdcToken: MockContract<MockERC20>;
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
            ethers.utils.parseEther("35")
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

        await txExec(
            protocolConfig
                .connect(owner)
                .setFactoryStatus([basicFactory.address], [true])
        );

        // sending funds
        await sendERC20Tokens(foreToken, {
            [alice.address]: ethers.utils.parseEther("1000"),
            [bob.address]: ethers.utils.parseEther("1000"),
            [carol.address]: ethers.utils.parseEther("1000"),
            [dave.address]: ethers.utils.parseEther("1000"),
        });

        const previousBlock = await ethers.provider.getBlock("latest");
        blockTimestamp = previousBlock.timestamp;

        await txExec(
            protocolConfig
                .connect(owner)
                .setMarketConfig(
                    ethers.utils.parseEther("1000"),
                    ethers.utils.parseEther("1000"),
                    ethers.utils.parseEther("1000"),
                    43200,
                    43200,
                    100,
                    100,
                    50,
                    150
                )
        );
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
        await txExec(
            basicFactory
                .connect(alice)
                .createMarket(
                    marketHash,
                    alice.address,
                    0,
                    0,
                    blockTimestamp + 200000,
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

    describe("Both markets sides have prediction", () => {
        beforeEach(async () => {
            await executeInSingleBlock(() => [
                contract
                    .connect(alice)
                    .predict(
                        ethers.utils.parseEther("50"),
                        true,
                        foreToken.address
                    ),
                contract
                    .connect(bob)
                    .predict(
                        ethers.utils.parseEther("40"),
                        false,
                        foreToken.address
                    ),
            ]);
        });

        describe("initial state", () => {
            it("Should return proper verifications number", async () => {
                expect(await contract.verificationHeight()).to.be.equal(0);
            });

            it("Should revert if executed before prediction end", async () => {
                await timetravel(blockTimestamp + 250000);

                await expect(
                    contract.connect(bob).verify(1, true)
                ).to.revertedWith("VerificationHasNotStartedYet");
            });
        });

        describe("after verification period start", () => {
            beforeEach(async () => {
                await timetravel(blockTimestamp + 300001);
            });

            it("Should revert if executed with non owned token", async () => {
                await expect(
                    contract.connect(bob).verify(0, true)
                ).to.revertedWith("BasicMarket: Incorrect owner");
            });

            for (const [sideName, sideValue] of Object.entries(sides)) {
                describe(`verifying ${sideName} side`, () => {
                    describe(`successfully`, () => {
                        let tx: ContractTransaction;

                        beforeEach(async () => {
                            [tx] = await txExec(
                                contract.connect(bob).verify(1, sideValue)
                            );
                        });

                        it("Should emit Transfer (ERC721) event", async () => {
                            await expect(tx)
                                .to.emit(foreVerifiers, "Transfer")
                                .withArgs(
                                    bob.address,
                                    contract.address,
                                    BigNumber.from(1)
                                );
                        });

                        it("Should emit Verify event", async () => {
                            await expect(tx)
                                .to.emit(
                                    { ...marketLib, address: contract.address },
                                    "Verify"
                                )
                                .withArgs(
                                    bob.address,
                                    ethers.utils.parseEther("35"),
                                    BigNumber.from(0),
                                    BigNumber.from(1),
                                    sideValue
                                );
                        });

                        it("Should update state size of verifications", async () => {
                            expect(
                                await contract.verificationHeight()
                            ).to.be.equal(1);
                        });

                        it("Should return proper verification state", async () => {
                            expect(await contract.verifications(0)).to.be.eql([
                                bob.address,
                                ethers.utils.parseEther("35"),
                                BigNumber.from(1),
                                sideValue,
                                false,
                            ]);
                        });

                        it("Should update market verification powers", async () => {
                            expect(await contract.marketInfo()).to.be.eql([
                                ethers.utils.parseEther("45.5"), // side A
                                ethers.utils.parseEther("36.4"), // side B
                                ethers.utils.parseEther(sideValue ? "35" : "0"), // verified A
                                ethers.utils.parseEther(sideValue ? "0" : "35"), // verified B
                                ethers.constants.AddressZero, // dispute creator
                                BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                                BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                                0, // result
                                false, // confirmed
                                false, // solved
                            ]);
                        });
                    });
                });
            }

            describe("multiple verifications", () => {
                beforeEach(async () => {
                    await executeInSingleBlock(() => [
                        contract.connect(alice).verify(0, false),
                        contract.connect(bob).verify(1, false),
                    ]);
                });

                describe("adding verification to almost fully verified market", () => {
                    beforeEach(async () => {
                        await txExec(contract.connect(carol).verify(2, false));
                    });

                    it("Should increase verification side with partial token power", async () => {
                        expect(await contract.marketInfo()).to.be.eql([
                            ethers.utils.parseEther("45.5"), // side A
                            ethers.utils.parseEther("36.4"), // side B
                            ethers.utils.parseEther("0"), // verified A
                            ethers.utils.parseEther("81.9"), // verified B
                            ethers.constants.AddressZero, // dispute creator
                            BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                            BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                            0, // result
                            false, // confirmed
                            false, // solved
                        ]);
                    });

                    it("Should return proper power in verification entry", async () => {
                        expect(await contract.verifications(2)).to.be.eql([
                            carol.address,
                            ethers.utils.parseEther("11.9"),
                            BigNumber.from(2),
                            false,
                            false,
                        ]);
                    });

                    it("Should not allow to verify fully verified market", async () => {
                        await expect(
                            contract.connect(dave).verify(3, false)
                        ).to.be.revertedWith("MarketIsFullyVerified");
                    });
                });
            });
        });

        describe("after verification period end", () => {
            beforeEach(async () => {
                await timetravel(blockTimestamp + 300000 + 43200 + 1);
            });

            it("Should revert trying to verify", async () => {
                await expect(
                    contract.connect(bob).verify(1, true)
                ).to.revertedWith("VerificationAlreadyClosed");
            });
        });
    });

    describe("Only sideA has prediction (invalid market)", () => {
        beforeEach(async () => {
            await executeInSingleBlock(() => [
                contract
                    .connect(alice)
                    .predict(
                        ethers.utils.parseEther("50"),
                        true,
                        foreToken.address
                    ),
                contract
                    .connect(bob)
                    .predict(
                        ethers.utils.parseEther("40"),
                        true,
                        foreToken.address
                    ),
            ]);
        });

        describe("initial state", () => {
            it("Should return proper verifications number", async () => {
                expect(await contract.verificationHeight()).to.be.equal(0);
            });

            it("Should revert if executed before prediction end", async () => {
                await timetravel(blockTimestamp + 25000);

                await expect(
                    contract.connect(bob).verify(1, true)
                ).to.revertedWith("VerificationHasNotStartedYet");
            });
        });

        describe("after verification period start", () => {
            beforeEach(async () => {
                await timetravel(blockTimestamp + 300001);
            });

            it("Should revert if executed with non owned token", async () => {
                await expect(
                    contract.connect(bob).verify(0, true)
                ).to.revertedWith("BasicMarket: Incorrect owner");
            });

            for (const [sideName, sideValue] of Object.entries(sides)) {
                describe(`verifying ${sideName} side`, () => {
                    describe(`successfully`, () => {
                        let tx: ContractTransaction;

                        beforeEach(async () => {
                            [tx] = await txExec(
                                contract.connect(bob).verify(1, sideValue)
                            );
                        });

                        it("Should emit CloseMarket event with invalid status", async () => {
                            await expect(tx)
                                .to.emit(
                                    { ...marketLib, address: contract.address },
                                    "CloseMarket"
                                )
                                .withArgs(4);
                        });

                        it("Should have zero state size of verifications", async () => {
                            expect(
                                await contract.verificationHeight()
                            ).to.be.equal(0);
                        });

                        it("Should have zero market verification powers", async () => {
                            expect(await contract.marketInfo()).to.be.eql([
                                ethers.utils.parseEther("81.9"), // side A
                                ethers.utils.parseEther("0"), // side B
                                ethers.utils.parseEther("0"), // verified A
                                ethers.utils.parseEther("0"), // verified B
                                ethers.constants.AddressZero, // dispute creator
                                BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                                BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                                4, // result, invalid = 4
                                false, // confirmed
                                false, // solved
                            ]);
                        });
                    });
                });
            }
        });
    });

    describe("Only sideB has prediction (invalid market)", () => {
        beforeEach(async () => {
            await executeInSingleBlock(() => [
                contract
                    .connect(alice)
                    .predict(
                        ethers.utils.parseEther("50"),
                        false,
                        foreToken.address
                    ),
                contract
                    .connect(bob)
                    .predict(
                        ethers.utils.parseEther("40"),
                        false,
                        foreToken.address
                    ),
            ]);
        });

        describe("initial state", () => {
            it("Should return proper verifications number", async () => {
                expect(await contract.verificationHeight()).to.be.equal(0);
            });

            it("Should revert if executed before prediction end", async () => {
                await timetravel(blockTimestamp + 25000);

                await expect(
                    contract.connect(bob).verify(1, true)
                ).to.revertedWith("VerificationHasNotStartedYet");
            });
        });

        describe("after verification period start", () => {
            beforeEach(async () => {
                await timetravel(blockTimestamp + 300001);
            });

            it("Should revert if executed with non owned token", async () => {
                await expect(
                    contract.connect(bob).verify(0, true)
                ).to.revertedWith("BasicMarket: Incorrect owner");
            });

            for (const [sideName, sideValue] of Object.entries(sides)) {
                describe(`verifying ${sideName} side`, () => {
                    describe(`successfully`, () => {
                        let tx: ContractTransaction;

                        beforeEach(async () => {
                            [tx] = await txExec(
                                contract.connect(bob).verify(1, sideValue)
                            );
                        });

                        it("Should emit CloseMarket event with invalid status", async () => {
                            await expect(tx)
                                .to.emit(
                                    { ...marketLib, address: contract.address },
                                    "CloseMarket"
                                )
                                .withArgs(4);
                        });

                        it("Should have zero state size of verifications", async () => {
                            expect(
                                await contract.verificationHeight()
                            ).to.be.equal(0);
                        });

                        it("Should have zero market verification powers", async () => {
                            expect(await contract.marketInfo()).to.be.eql([
                                ethers.utils.parseEther("0"), // side A
                                ethers.utils.parseEther("81.9"), // side B
                                ethers.utils.parseEther("0"), // verified A
                                ethers.utils.parseEther("0"), // verified B
                                ethers.constants.AddressZero, // dispute creator
                                BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                                BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                                4, // result, invalid = 4
                                false, // confirmed
                                false, // solved
                            ]);
                        });
                    });
                });
            }
        });
    });
});
