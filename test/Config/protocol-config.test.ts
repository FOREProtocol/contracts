import { MarketConfig } from "@/MarketConfig";
import {
    FoundationWalletChangedEvent,
    HighGuardChangedEvent,
    MarketConfigurationUpdatedEvent,
    MarketCreationChangedEvent,
    MarketplaceChangedEvent,
    ProtocolConfig,
    RevenueWalletChangedEvent,
    VerifierMintPriceChangedEvent,
} from "@/ProtocolConfig";
import { ContractReceipt } from "@ethersproject/contracts/src.ts/index";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, ContractTransaction } from "ethers";
import { ethers } from "hardhat";
import {
    assertEvent,
    assertIsAvailableOnlyForOwner,
    attachContract,
    deployContract,
    txExec,
} from "../helpers/utils";

describe("Protocol configuration", () => {
    let owner: SignerWithAddress;
    let foundationWallet: SignerWithAddress;
    let revenueWallet: SignerWithAddress;
    let highGuardAccount: SignerWithAddress;
    let marketplaceContract: SignerWithAddress;
    let foreTokenContract: SignerWithAddress;
    let foreVerifiersContract: SignerWithAddress;
    let alice: SignerWithAddress;

    let contract: ProtocolConfig;

    beforeEach(async () => {
        [
            owner,
            foundationWallet,
            revenueWallet,
            highGuardAccount,
            marketplaceContract,
            foreTokenContract,
            foreVerifiersContract,
            alice,
        ] = await ethers.getSigners();

        contract = await deployContract<ProtocolConfig>(
            "ProtocolConfig",
            foundationWallet.address,
            revenueWallet.address,
            highGuardAccount.address,
            marketplaceContract.address,
            foreTokenContract.address,
            foreVerifiersContract.address,
            ethers.utils.parseEther("2"),
            ethers.utils.parseEther("3")
        );
    });

    describe("Initial state", () => {
        it("Should expose proper foundation wallet", async () => {
            expect(await contract.foundationWallet()).to.be.equal(
                foundationWallet.address
            );
        });

        it("Should expose proper revenue wallet", async () => {
            expect(await contract.revenueWallet()).to.be.equal(
                revenueWallet.address
            );
        });

        it("Should expose proper high guard account", async () => {
            expect(await contract.highGuard()).to.be.equal(
                highGuardAccount.address
            );
        });

        it("Should expose proper marketplace address", async () => {
            expect(await contract.marketplace()).to.be.equal(
                marketplaceContract.address
            );
        });

        it("Should expose proper FORE token address", async () => {
            expect(await contract.foreToken()).to.be.equal(
                foreTokenContract.address
            );
        });

        it("Should expose proper FORE NFT token address", async () => {
            expect(await contract.foreVerifiers()).to.be.equal(
                foreVerifiersContract.address
            );
        });

        it("Should expose proper market creation price", async () => {
            expect(await contract.marketCreationPrice()).to.be.equal(
                ethers.utils.parseEther("2")
            );
        });

        it("Should expose proper verifier token mint price", async () => {
            expect(await contract.verifierMintPrice()).to.be.equal(
                ethers.utils.parseEther("3")
            );
        });

        describe("Market configuration", () => {
            let marketConfig: MarketConfig;

            beforeEach(async () => {
                marketConfig = await attachContract(
                    "MarketConfig",
                    await contract.marketConfig()
                );
            });

            it("Should expose proper configuration", async () => {
                expect(await marketConfig.config()).to.be.eql([
                    ethers.utils.parseEther("1000"),
                    BigNumber.from(1800),
                    BigNumber.from(1800),
                    BigNumber.from(100),
                    BigNumber.from(100),
                    BigNumber.from(100),
                    BigNumber.from(50),
                    BigNumber.from(150),
                ]);
            });

            it("Should expose proper dispute price", async () => {
                expect(await marketConfig.disputePrice()).to.be.equal(
                    ethers.utils.parseEther("1000")
                );
            });

            it("Should expose proper dispute period", async () => {
                expect(await marketConfig.disputePeriod()).to.be.equal(1800);
            });

            it("Should expose proper verification period", async () => {
                expect(await marketConfig.verificationPeriod()).to.be.equal(
                    1800
                );
            });

            it("Should expose proper burn fee", async () => {
                expect(await marketConfig.burnFee()).to.be.equal(100);
            });

            it("Should expose proper foundation fee", async () => {
                expect(await marketConfig.foundationFee()).to.be.equal(100);
            });

            it("Should expose proper revenue fee", async () => {
                expect(await marketConfig.revenueFee()).to.be.equal(100);
            });

            it("Should expose proper market creation fee", async () => {
                expect(await marketConfig.marketCreatorFee()).to.be.equal(50);
            });

            it("Should expose proper verification fee", async () => {
                expect(await marketConfig.verificationFee()).to.be.equal(150);
            });
        });
    });

    describe("Change market config", () => {
        it("Should allow to execute only by owner", async () => {
            await assertIsAvailableOnlyForOwner(async (account) => {
                return contract
                    .connect(account)
                    .setMarketConfig(
                        ethers.utils.parseEther("10"),
                        ethers.utils.parseEther("20"),
                        ethers.utils.parseEther("30"),
                        40,
                        50,
                        60,
                        70,
                        80,
                        90,
                        100
                    );
            });
        });

        it("Should not allow fees exceeding limits", async () => {
            await expect(
                contract
                    .connect(owner)
                    .setMarketConfig(
                        ethers.utils.parseEther("10"),
                        ethers.utils.parseEther("20"),
                        ethers.utils.parseEther("30"),
                        40,
                        50,
                        100,
                        100,
                        100,
                        100,
                        101
                    )
            ).to.revertedWith("ForeFactory: Config limit");
        });

        it("Should not allow dispute price exceed limit", async () => {
            await expect(
                contract
                    .connect(owner)
                    .setMarketConfig(
                        ethers.utils.parseEther("10"),
                        ethers.utils.parseEther("20"),
                        ethers.utils.parseEther("1001"),
                        40,
                        50,
                        10,
                        10,
                        10,
                        10,
                        10
                    )
            ).to.revertedWith("ForeFactory: Config limit");
        });

        it("Should not allow verifier mint price exceed limit", async () => {
            await expect(
                contract
                    .connect(owner)
                    .setMarketConfig(
                        ethers.utils.parseEther("10"),
                        ethers.utils.parseEther("1001"),
                        ethers.utils.parseEther("10"),
                        40,
                        50,
                        10,
                        10,
                        10,
                        10,
                        10
                    )
            ).to.revertedWith("ForeFactory: Config limit");
        });

        it("Should not allow creation price exceed limit", async () => {
            await expect(
                contract
                    .connect(owner)
                    .setMarketConfig(
                        ethers.utils.parseEther("1001"),
                        ethers.utils.parseEther("10"),
                        ethers.utils.parseEther("10"),
                        40,
                        50,
                        10,
                        10,
                        10,
                        10,
                        10
                    )
            ).to.revertedWith("ForeFactory: Config limit");
        });

        it("Old config should not be mutated", async () => {
            const oldConfig: MarketConfig = await attachContract(
                "MarketConfig",
                await contract.marketConfig()
            );

            await txExec(
                contract
                    .connect(owner)
                    .setMarketConfig(
                        ethers.utils.parseEther("10"),
                        ethers.utils.parseEther("10"),
                        ethers.utils.parseEther("10"),
                        40,
                        50,
                        10,
                        10,
                        10,
                        10,
                        10
                    )
            );

            expect(await oldConfig.config()).to.be.eql([
                ethers.utils.parseEther("1000"),
                BigNumber.from(1800),
                BigNumber.from(1800),
                BigNumber.from(100),
                BigNumber.from(100),
                BigNumber.from(100),
                BigNumber.from(50),
                BigNumber.from(150),
            ]);
        });

        it("Should not mutate previous config but create new one", async () => {
            const oldConfig = await contract.marketConfig();

            await txExec(
                contract
                    .connect(owner)
                    .setMarketConfig(
                        ethers.utils.parseEther("10"),
                        ethers.utils.parseEther("10"),
                        ethers.utils.parseEther("10"),
                        40,
                        50,
                        10,
                        10,
                        10,
                        10,
                        10
                    )
            );

            expect(await contract.marketConfig()).to.be.not.equal(oldConfig);
        });

        describe("successfully", () => {
            let tx: ContractTransaction;
            let recipt: ContractReceipt;

            beforeEach(async () => {
                [tx, recipt] = await txExec(
                    contract
                        .connect(owner)
                        .setMarketConfig(
                            ethers.utils.parseEther("10"),
                            ethers.utils.parseEther("20"),
                            ethers.utils.parseEther("30"),
                            40,
                            50,
                            60,
                            70,
                            80,
                            90,
                            100
                        )
                );
            });

            it("Should emit MarketConfigurationUpdated event", async () => {
                assertEvent<MarketConfigurationUpdatedEvent>(
                    recipt,
                    "MarketConfigurationUpdated"
                );
            });
        });
    });

    describe("Change foundation wallet", () => {
        it("Should allow to execute only by owner", async () => {
            await assertIsAvailableOnlyForOwner(async (account) => {
                return contract
                    .connect(account)
                    .setFoundationWallet(alice.address);
            });
        });

        it("Should emit MarketConfigurationUpdated event", async () => {
            const [tx, recipt] = await txExec(
                contract.connect(owner).setFoundationWallet(alice.address)
            );

            assertEvent<FoundationWalletChangedEvent>(
                recipt,
                "FoundationWalletChanged",
                {
                    addr: alice.address,
                }
            );
        });
    });

    describe("Change revenue wallet", () => {
        it("Should allow to execute only by owner", async () => {
            await assertIsAvailableOnlyForOwner(async (account) => {
                return contract
                    .connect(account)
                    .setRevenueWallet(alice.address);
            });
        });

        it("Should emit RevenueWalletChanged event", async () => {
            const [tx, recipt] = await txExec(
                contract.connect(owner).setRevenueWallet(alice.address)
            );

            assertEvent<RevenueWalletChangedEvent>(
                recipt,
                "RevenueWalletChanged",
                {
                    addr: alice.address,
                }
            );
        });
    });

    describe("Change high guard account", () => {
        it("Should allow to execute only by owner", async () => {
            await assertIsAvailableOnlyForOwner(async (account) => {
                return contract.connect(account).setHighGuard(alice.address);
            });
        });

        it("Should emit HighGuardChanged event", async () => {
            const [tx, recipt] = await txExec(
                contract.connect(owner).setHighGuard(alice.address)
            );

            assertEvent<HighGuardChangedEvent>(recipt, "HighGuardChanged", {
                addr: alice.address,
            });
        });
    });

    describe("Change marketplace contract address", () => {
        it("Should allow to execute only by owner", async () => {
            await assertIsAvailableOnlyForOwner(async (account) => {
                return contract.connect(account).setMarketplace(alice.address);
            });
        });

        it("Should emit HighGuardChanged event", async () => {
            const [tx, recipt] = await txExec(
                contract.connect(owner).setMarketplace(alice.address)
            );

            assertEvent<MarketplaceChangedEvent>(recipt, "MarketplaceChanged", {
                addr: alice.address,
            });
        });
    });

    describe("Change verifier NFT mint price", () => {
        it("Should allow to execute only by owner", async () => {
            await assertIsAvailableOnlyForOwner(async (account) => {
                return contract
                    .connect(account)
                    .setVerifierMintPrice(ethers.utils.parseEther("5"));
            });
        });

        it("Should not allow to execute with price exceeding limit", async () => {
            await expect(
                contract
                    .connect(owner)
                    .setVerifierMintPrice(ethers.utils.parseEther("1001"))
            ).to.revertedWith("ProtocoConfig: Max price exceed");
        });

        it("Should emit VerifierMintPriceChanged event", async () => {
            const [tx, recipt] = await txExec(
                contract
                    .connect(owner)
                    .setVerifierMintPrice(ethers.utils.parseEther("5"))
            );

            assertEvent<VerifierMintPriceChangedEvent>(
                recipt,
                "VerifierMintPriceChanged",
                {
                    amount: ethers.utils.parseEther("5"),
                }
            );
        });
    });

    describe("Change market creation price", () => {
        it("Should allow to execute only by owner", async () => {
            await assertIsAvailableOnlyForOwner(async (account) => {
                return contract
                    .connect(account)
                    .setMarketCreationPrice(ethers.utils.parseEther("5"));
            });
        });

        it("Should not allow to execute with price exceeding limit", async () => {
            await expect(
                contract
                    .connect(owner)
                    .setMarketCreationPrice(ethers.utils.parseEther("1001"))
            ).to.revertedWith("ProtocoConfig: Max price exceed");
        });

        it("Should emit MarketCreationChanged event", async () => {
            const [tx, recipt] = await txExec(
                contract
                    .connect(owner)
                    .setMarketCreationPrice(ethers.utils.parseEther("5"))
            );

            assertEvent<MarketCreationChangedEvent>(
                recipt,
                "MarketCreationChanged",
                {
                    amount: ethers.utils.parseEther("5"),
                }
            );
        });
    });
});
