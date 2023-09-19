import { MarketConfig } from "@/MarketConfig";
import {
    FoundationWalletChangedEvent,
    HighGuardChangedEvent,
    MarketConfigurationUpdatedEvent,
    MarketCreationChangedEvent,
    MarketplaceChangedEvent,
    ProtocolConfig,
    VerifierMintPriceChangedEvent,
    SetStatusForFactoryEvent,
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
} from "./helpers/utils";

describe("Protocol configuration", () => {
    let owner: SignerWithAddress;
    let foundationWallet: SignerWithAddress;
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
            highGuardAccount,
            marketplaceContract,
            foreTokenContract,
            foreVerifiersContract,
            alice,
        ] = await ethers.getSigners();

        contract = await deployContract<ProtocolConfig>(
            "ProtocolConfig",
            foundationWallet.address,
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

        it("Should return proper whitelist status", async () => {
            expect(
                await contract.isFactoryWhitelisted(owner.address)
            ).to.be.equal(false);
        });

        it("Should return proper tier configuration", async () => {
            const [minVerifications, multiplier] = await contract.getTier(1);
            expect(multiplier).to.be.equal(BigNumber.from(11000));
            expect(minVerifications).to.be.equal(BigNumber.from(30));
        });

        it("Should return proper tier configurations", async () => {
            const tiers = await contract.getTiers();
            const [tier0, tier1, tier2, tier3] = tiers;

            expect(tier0.multiplier).to.be.equal(BigNumber.from(10000));
            expect(tier0.minVerifications).to.be.equal(BigNumber.from(0));

            expect(tier1.multiplier).to.be.equal(BigNumber.from(11000));
            expect(tier1.minVerifications).to.be.equal(BigNumber.from(30));

            expect(tier2.multiplier).to.be.equal(BigNumber.from(11750));
            expect(tier2.minVerifications).to.be.equal(BigNumber.from(75));

            expect(tier3.multiplier).to.be.equal(BigNumber.from(12250));
            expect(tier3.minVerifications).to.be.equal(BigNumber.from(150));
        });

        it("Should return proper addresses", async () => {
            const [
                marketConfigAddress,
                foundationWalletAddress,
                highGuardAddress,
                marketplaceAddress,
                foreTokenAddress,
                foreVerifiersAddress,
            ] = await contract.addresses();

            expect(marketConfigAddress).to.be.equal(
                await contract.marketConfig()
            );
            expect(foundationWalletAddress).to.be.equal(
                foundationWallet.address
            );
            expect(highGuardAddress).to.be.equal(highGuardAccount.address);
            expect(marketplaceAddress).to.be.equal(marketplaceContract.address);
            expect(foreTokenAddress).to.be.equal(foreTokenContract.address);
            expect(foreVerifiersAddress).to.be.equal(
                foreVerifiersContract.address
            );
        });

        it("Should return proper role addresses", async () => {
            const [foundationWalletAddress, highGuardAddress] =
                await contract.roleAddresses();
            expect(foundationWalletAddress).to.be.equal(
                foundationWallet.address
            );
            expect(highGuardAddress).to.be.equal(highGuardAccount.address);
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
                    BigNumber.from(86400),
                    BigNumber.from(86400),
                    BigNumber.from(100),
                    BigNumber.from(150),
                    BigNumber.from(50),
                    BigNumber.from(200),
                ]);
            });

            it("Should expose proper dispute price", async () => {
                expect(await marketConfig.disputePrice()).to.be.equal(
                    ethers.utils.parseEther("1000")
                );
            });

            it("Should expose proper dispute period", async () => {
                expect(await marketConfig.disputePeriod()).to.be.equal(86400);
            });

            it("Should expose proper verification period", async () => {
                expect(await marketConfig.verificationPeriod()).to.be.equal(
                    86400
                );
            });

            it("Should expose proper burn fee", async () => {
                expect(await marketConfig.burnFee()).to.be.equal(100);
            });

            it("Should expose proper foundation fee", async () => {
                expect(await marketConfig.foundationFee()).to.be.equal(150);
            });

            it("Should expose proper market creation fee", async () => {
                expect(await marketConfig.marketCreatorFee()).to.be.equal(50);
            });

            it("Should expose proper verification fee", async () => {
                expect(await marketConfig.verificationFee()).to.be.equal(200);
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
                        43200,
                        43200,
                        60,
                        70,
                        90,
                        100
                    );
            });
        });

        it("Should not allow invalid dispute period", async () => {
            await expect(
                contract
                    .connect(owner)
                    .setMarketConfig(
                        ethers.utils.parseEther("10"),
                        ethers.utils.parseEther("20"),
                        ethers.utils.parseEther("30"),
                        20000,
                        43200,
                        60,
                        70,
                        90,
                        100
                    )
            ).to.revertedWith("ForeFactory: Invalid dispute period");
        });

        it("Should not allow invalid validation period", async () => {
            await expect(
                contract
                    .connect(owner)
                    .setMarketConfig(
                        ethers.utils.parseEther("10"),
                        ethers.utils.parseEther("20"),
                        ethers.utils.parseEther("30"),
                        43200,
                        20000,
                        60,
                        70,
                        90,
                        100
                    )
            ).to.revertedWith("ForeFactory: Invalid validation period");
        });

        it("Should not allow fees exceeding limits", async () => {
            await expect(
                contract
                    .connect(owner)
                    .setMarketConfig(
                        ethers.utils.parseEther("10"),
                        ethers.utils.parseEther("20"),
                        ethers.utils.parseEther("30"),
                        43200,
                        43200,
                        100,
                        100,
                        200,
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
                        43200,
                        43200,
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
                        43200,
                        43200,
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
                        43200,
                        43200,
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
                        43200,
                        43200,
                        10,
                        10,
                        10,
                        10
                    )
            );

            expect(await oldConfig.config()).to.be.eql([
                ethers.utils.parseEther("1000"),
                BigNumber.from(86400),
                BigNumber.from(86400),
                BigNumber.from(100),
                BigNumber.from(150),
                BigNumber.from(50),
                BigNumber.from(200),
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
                        43200,
                        43200,
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
                            43200,
                            43200,
                            60,
                            70,
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

    describe("Change tier config", () => {
        it("Should allow to execute only by owner", async () => {
            await assertIsAvailableOnlyForOwner(async (account) => {
                return contract.connect(account).editTier(2, 40, 11600);
            });
        });

        it("Should change multiplier for first tier", async () => {
            await txExec(contract.connect(owner).editTier(0, 0, 1000));
        });

        it("Should change multiplier for last tier", async () => {
            await txExec(contract.connect(owner).editTier(3, 150, 15000));
        });

        it("Should change min verifications for last tier", async () => {
            await txExec(contract.connect(owner).editTier(3, 200, 12250));
        });

        it("Should not allow 0 multiplier for first tier", async () => {
            await expect(
                contract.connect(owner).editTier(0, 0, 0)
            ).to.revertedWith(
                "ProtocolConfig: 1st tier multiplier must be greater than zero"
            );
        });

        it("Should not allow 0 minimum validations for second tier", async () => {
            await expect(
                contract.connect(owner).editTier(1, 0, 0)
            ).to.revertedWith("ProtocolConfig: Cant disable non last element");
        });

        it("Should not allow less validations than previous tier", async () => {
            await expect(
                contract.connect(owner).editTier(2, 29, 11750)
            ).to.revertedWith(
                "ProtocolConfig: Sort error, minVerifications must be higher then previous tier"
            );
        });

        it("Should not allow more validations than next tier", async () => {
            await expect(
                contract.connect(owner).editTier(2, 150, 11750)
            ).to.revertedWith(
                "ProtocolConfig: Sort error, minVerifications must be smaller then next tier"
            );
        });

        it("Should not allow smaller multiplier than previous tier", async () => {
            await expect(
                contract.connect(owner).editTier(2, 75, 11000)
            ).to.revertedWith(
                "ProtocolConfig: Sort error, multiplier must be higher then previous tier"
            );
        });

        it("Should not allow bigger multiplier than next tier", async () => {
            await expect(
                contract.connect(owner).editTier(2, 75, 12250)
            ).to.revertedWith(
                "ProtocolConfig: Sort error, multiplier must be smaller then next tier"
            );
        });
    });

    describe("Set whitelist status", () => {
        describe("Successful", () => {
            let tx: ContractTransaction;
            let recipt: ContractReceipt;

            beforeEach(async () => {
                [tx, recipt] = await txExec(
                    contract
                        .connect(owner)
                        .setFactoryStatus([alice.address], [true])
                );
            });

            it("Should allow to execute only by owner", async () => {
                await assertIsAvailableOnlyForOwner(async (account) => {
                    return contract
                        .connect(account)
                        .setFactoryStatus([foundationWallet.address], [true]);
                });
            });

            it("Should emit SetStatusForFactory event", async () => {
                assertEvent<SetStatusForFactoryEvent>(
                    recipt,
                    "SetStatusForFactory",
                    {
                        add: alice.address,
                        status: true,
                    }
                );
            });

            it("Should have enabled status", async () => {
                expect(
                    await contract.isFactoryWhitelisted(alice.address)
                ).to.be.equal(true);
            });

            describe("Edit few statuses", () => {
                beforeEach(async () => {
                    [tx, recipt] = await txExec(
                        contract
                            .connect(owner)
                            .setFactoryStatus(
                                [alice.address, owner.address],
                                [false, true]
                            )
                    );
                });

                it("Should properly change statuses", async () => {
                    expect(
                        await contract.isFactoryWhitelisted(alice.address)
                    ).to.be.equal(false);
                    expect(
                        await contract.isFactoryWhitelisted(owner.address)
                    ).to.be.equal(true);
                });
            });
        });

        describe("Invalid status", () => {
            it("Should revert when empty status", async () => {
                await expect(
                    contract
                        .connect(owner)
                        .setFactoryStatus([foundationWallet.address], [])
                ).to.be.revertedWith("ProtocolConfig: Len mismatch");
            });

            it("Should revert when empty factory address", async () => {
                await expect(
                    contract
                        .connect(owner)
                        .setFactoryStatus(
                            [ethers.constants.AddressZero],
                            [true]
                        )
                ).to.be.revertedWith(
                    "ProtocolConfig: Factory address cannot be zero"
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

        it("Should revert when ZERO address", async () => {
            await expect(
                contract
                    .connect(owner)
                    .setFoundationWallet(ethers.constants.AddressZero)
            ).to.be.revertedWith(
                "ProtocolConfig: Foundation address cannot be zero"
            );
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

    describe("Change high guard account", () => {
        it("Should allow to execute only by owner", async () => {
            await assertIsAvailableOnlyForOwner(async (account) => {
                return contract.connect(account).setHighGuard(alice.address);
            });
        });

        it("Should revert when ZERO address", async () => {
            await expect(
                contract
                    .connect(owner)
                    .setHighGuard(ethers.constants.AddressZero)
            ).to.be.revertedWith(
                "ProtocolConfig: HighGuard address cannot be zero"
            );
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

        it("Should revert when ZERO address", async () => {
            await expect(
                contract
                    .connect(owner)
                    .setMarketplace(ethers.constants.AddressZero)
            ).to.be.revertedWith(
                "ProtocolConfig: Marketplace address cannot be zero"
            );
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
            ).to.revertedWith("ProtocolConfig: Max price exceed");
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
            ).to.revertedWith("ProtocolConfig: Max price exceed");
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

describe("Constructor arguments", () => {
    let owner: SignerWithAddress;
    let foundationWallet: SignerWithAddress;
    let highGuardAccount: SignerWithAddress;
    let marketplaceContract: SignerWithAddress;
    let foreTokenContract: SignerWithAddress;
    let foreVerifiersContract: SignerWithAddress;

    beforeEach(async () => {
        [
            owner,
            foundationWallet,
            highGuardAccount,
            marketplaceContract,
            foreTokenContract,
            foreVerifiersContract,
        ] = await ethers.getSigners();
    });

    it("Should revert with empty foundation wallet", async () => {
        await expect(
            deployContract<ProtocolConfig>(
                "ProtocolConfig",
                ethers.constants.AddressZero,
                highGuardAccount.address,
                marketplaceContract.address,
                foreTokenContract.address,
                foreVerifiersContract.address,
                ethers.utils.parseEther("2"),
                ethers.utils.parseEther("3")
            )
        ).to.revertedWith("ProtocolConfig: Foundation address cannot be zero");
    });

    it("Should revert with empty highguard wallet", async () => {
        await expect(
            deployContract<ProtocolConfig>(
                "ProtocolConfig",
                foundationWallet.address,
                ethers.constants.AddressZero,
                marketplaceContract.address,
                foreTokenContract.address,
                foreVerifiersContract.address,
                ethers.utils.parseEther("2"),
                ethers.utils.parseEther("3")
            )
        ).to.revertedWith("ProtocolConfig: HighGuard address cannot be zero");
    });

    it("Should revert with empty marketplace address", async () => {
        await expect(
            deployContract<ProtocolConfig>(
                "ProtocolConfig",
                foundationWallet.address,
                highGuardAccount.address,
                ethers.constants.AddressZero,
                foreTokenContract.address,
                foreVerifiersContract.address,
                ethers.utils.parseEther("2"),
                ethers.utils.parseEther("3")
            )
        ).to.revertedWith("ProtocolConfig: Marketplace address cannot be zero");
    });

    it("Should revert with empty fore token address", async () => {
        await expect(
            deployContract<ProtocolConfig>(
                "ProtocolConfig",
                foundationWallet.address,
                highGuardAccount.address,
                marketplaceContract.address,
                ethers.constants.AddressZero,
                foreVerifiersContract.address,
                ethers.utils.parseEther("2"),
                ethers.utils.parseEther("3")
            )
        ).to.revertedWith("ProtocolConfig: FOREToken address cannot be zero");
    });

    it("Should revert with empty fore verifiers address", async () => {
        await expect(
            deployContract<ProtocolConfig>(
                "ProtocolConfig",
                foundationWallet.address,
                highGuardAccount.address,
                marketplaceContract.address,
                foreTokenContract.address,
                ethers.constants.AddressZero,
                ethers.utils.parseEther("2"),
                ethers.utils.parseEther("3")
            )
        ).to.revertedWith(
            "ProtocolConfig: FOREVerifiers address cannot be zero"
        );
    });
});
