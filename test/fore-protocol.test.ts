import { BasicMarket } from "@/BasicMarket";
import { BaseURIEvent, ForeProtocol, UpgradeTierEvent } from "@/ForeProtocol";
import { BasicFactory } from "@/BasicFactory";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers } from "@/ForeVerifiers";
import { ProtocolConfig } from "@/ProtocolConfig";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract, ContractTransaction } from "ethers";
import { ethers, upgrades } from "hardhat";
import {
    assertEvent,
    assertIsAvailableOnlyForOwner,
    attachContract,
    deployContract,
    deployLibrary,
    deployMockedContract,
    txExec,
} from "./helpers/utils";
import { MockERC20 } from "@/MockERC20";

describe("ForeProtocol", () => {
    let owner: SignerWithAddress;
    let foundationWallet: SignerWithAddress;
    let highGuardAccount: SignerWithAddress;
    let marketplaceContract: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    let protocolConfig: ProtocolConfig;
    let foreToken: MockContract<ForeToken>;
    let foreVerifiers: MockContract<ForeVerifiers>;
    let protocol: ForeProtocol;
    let contract: BasicFactory;
    let tokenRegistry: Contract;
    let usdcToken: MockContract<MockERC20>;

    beforeEach(async () => {
        [
            owner,
            foundationWallet,
            highGuardAccount,
            marketplaceContract,
            alice,
            bob,
        ] = await ethers.getSigners();

        foreToken = await deployMockedContract<ForeToken>("ForeToken");
        foreVerifiers = await deployMockedContract<ForeVerifiers>(
            "ForeVerifiers",
            "https://markets.api.foreprotocol.io/verifiers/"
        );

        protocolConfig = await deployContract<ProtocolConfig>(
            "ProtocolConfig",
            foundationWallet.address,
            highGuardAccount.address,
            marketplaceContract.address,
            foreToken.address,
            foreVerifiers.address,
            ethers.utils.parseEther("10"),
            ethers.utils.parseEther("20")
        );

        await deployLibrary("MarketLib", ["BasicMarket", "BasicFactory"]);

        protocol = await deployContract<ForeProtocol>(
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
        ];
        tokenRegistry = await upgrades.deployProxy(contractFactory, [tokens]);

        contract = await deployContract<BasicFactory>(
            "BasicFactory",
            protocol.address,
            tokenRegistry.address
        );

        await txExec(foreVerifiers.setProtocol(protocol.address));

        await txExec(
            foreToken
                .connect(owner)
                .transfer(bob.address, ethers.utils.parseEther("1000"))
        );

        await txExec(
            protocolConfig
                .connect(owner)
                .setFactoryStatus([contract.address], [true])
        );

        // allowance
        await txExec(
            foreToken
                .connect(alice)
                .approve(
                    protocol.address,
                    ethers.utils.parseUnits("1000", "ether")
                )
        );
        await txExec(
            foreToken
                .connect(bob)
                .approve(
                    protocol.address,
                    ethers.utils.parseUnits("1000", "ether")
                )
        );

        await txExec(
            foreToken
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
    });

    describe("Initial state", () => {
        it("Should expose proper name", async () => {
            expect(await protocol.name()).to.be.equal("Fore Markets");
        });

        it("Should expose proper symbol", async () => {
            expect(await protocol.symbol()).to.be.equal("MFORE");
        });

        it("Should use fallback for isApprovedForAll with any account", async () => {
            expect(
                await protocol.isApprovedForAll(alice.address, bob.address)
            ).to.be.equal(false);
        });

        it("allMarketsLength() should be increased", async () => {
            expect(await protocol.allMarketLength()).to.be.equal(0);
        });

        it("Should return proper foreToken address", async () => {
            expect(await protocol.foreToken()).to.be.equal(foreToken.address);
        });

        it("Should return proper config address", async () => {
            expect(await protocol.config()).to.be.equal(protocolConfig.address);
        });

        it("Should return proper verifiers address", async () => {
            expect(await protocol.foreVerifiers()).to.be.equal(
                foreVerifiers.address
            );
        });
    });

    describe("Change base uri", () => {
        it("Should allow to execute only by owner", async () => {
            await assertIsAvailableOnlyForOwner(async (account) => {
                return protocol
                    .connect(account)
                    .editBaseUri("https://test.com/%.json");
            });
        });

        it("Should emit BaseURI event", async () => {
            const [, receipt] = await txExec(
                protocol.connect(owner).editBaseUri("https://test.com/%.json")
            );

            assertEvent<BaseURIEvent>(receipt, "BaseURI", {
                value: "https://test.com/%.json",
            });
        });
    });

    describe("For non created token", () => {
        it("tokenURI() should revert", async () => {
            await expect(protocol.tokenURI(1)).to.be.revertedWith(
                "Non minted token"
            );
        });
    });

    describe("Fore operator verification", () => {
        it("Should return false for sample account", async () => {
            expect(await protocol.isForeOperator(alice.address)).to.be.equal(
                false
            );
        });

        it("Should return true for marketplace", async () => {
            expect(
                await protocol.isForeOperator(marketplaceContract.address)
            ).to.be.equal(true);
        });

        it("Should return true for factory", async () => {
            expect(await protocol.isForeOperator(contract.address)).to.be.equal(
                true
            );
        });
    });

    describe("Minting verifier NFT", () => {
        it("Should revert without funds for minting fee", async () => {
            await expect(
                protocol.connect(alice).mintVerifier(bob.address)
            ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });

        describe("successfully", () => {
            let tx: ContractTransaction;

            beforeEach(async () => {
                [tx] = await txExec(
                    protocol.connect(bob).mintVerifier(alice.address)
                );
            });

            it("Should call foreToken.transfer()", async () => {
                expect(foreToken.transferFrom.getCall(0).args).to.be.eql([
                    bob.address,
                    foreVerifiers.address,
                    ethers.utils.parseEther("20"),
                ]);
            });

            it("Should transfer funds (ERC20 Transfer)", async () => {
                expect(tx)
                    .to.emit(foreToken, "Transfer")
                    .withArgs(
                        bob.address,
                        foreVerifiers.address,
                        ethers.utils.parseEther("20")
                    );
            });

            it("Should call foreVerifiers.mintWithPower()", async () => {
                expect(foreVerifiers.mintWithPower.getCall(0).args).to.be.eql([
                    alice.address,
                    ethers.utils.parseEther("20"),
                    ethers.utils.parseEther("0"),
                    ethers.utils.parseEther("0"),
                ]);
            });

            it("Should emit token creation event (ERC721 Transfer)", async () => {
                expect(tx)
                    .to.emit(foreVerifiers, "Transfer")
                    .withArgs(
                        "0x0000000000000000000000000000000000000000",
                        alice.address,
                        BigNumber.from(0)
                    );
            });
        });
    });

    describe("Buying verifier NFT power", () => {
        beforeEach(async () => {
            await txExec(protocol.connect(bob).mintVerifier(alice.address));
            await txExec(
                protocolConfig.setVerifierMintPrice(
                    ethers.utils.parseEther("100")
                )
            );
        });

        it("Should revert without funds for buying power", async () => {
            await expect(
                protocol
                    .connect(alice)
                    .buyPower(0, ethers.utils.parseEther("80"))
            ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });

        it("Should revert without funds for buying power", async () => {
            await expect(
                protocol.connect(bob).buyPower(0, ethers.utils.parseEther("81"))
            ).to.be.revertedWith("ForeFactory: Buy limit reached");
        });

        describe("successfully", () => {
            let tx: ContractTransaction;

            beforeEach(async () => {
                [tx] = await txExec(
                    protocol
                        .connect(bob)
                        .buyPower(0, ethers.utils.parseEther("80"))
                );
            });

            it("Should call foreToken.transfer()", async () => {
                expect(foreToken.transferFrom.getCall(1).args).to.be.eql([
                    bob.address,
                    foreVerifiers.address,
                    ethers.utils.parseEther("80"),
                ]);
            });

            it("Should transfer funds (ERC20 Transfer)", async () => {
                expect(tx)
                    .to.emit(foreToken, "Transfer")
                    .withArgs(
                        bob.address,
                        foreVerifiers.address,
                        ethers.utils.parseEther("80")
                    );
            });

            it("Should call foreVerifiers.increasePower()", async () => {
                expect(foreVerifiers.increasePower.getCall(0).args).to.be.eql([
                    BigNumber.from(0),
                    ethers.utils.parseEther("80"),
                    false,
                ]);
            });

            it("Should emit TokenPowerIncreased event", async () => {
                expect(tx)
                    .to.emit(foreVerifiers, "TokenPowerIncreased")
                    .withArgs(
                        BigNumber.from(0),
                        ethers.utils.parseEther("80"),
                        ethers.utils.parseEther("100")
                    );
            });
        });
    });

    describe("Upgrading verifier NFT", () => {
        beforeEach(async () => {
            await foreVerifiers.setVariable("protocol", owner.address);
        });

        describe("enough validations to upgrade", () => {
            beforeEach(async () => {
                await txExec(
                    foreVerifiers
                        .connect(owner)
                        .mintWithPower(alice.address, 15000, 2, 1500)
                );

                await foreVerifiers.setVariable("protocol", protocol.address);
            });

            it("Should allow upgrade to next tier", async () => {
                const [, receipt] = await txExec(
                    protocol.connect(alice).upgradeTier(0)
                );

                assertEvent<UpgradeTierEvent>(receipt, "UpgradeTier", {
                    oldTokenId: BigNumber.from(0),
                    newTokenId: BigNumber.from(1),
                    newTier: BigNumber.from(3),
                    verificationsNum: BigNumber.from(1500),
                });
            });

            it("Should revert when trying to upgrade to invalid tier", async () => {
                await txExec(protocol.connect(alice).upgradeTier(0));

                await expect(
                    protocol.connect(alice).upgradeTier(1)
                ).to.revertedWith(
                    "ForeProtocol: Cant upgrade, next tier invalid"
                );
            });
        });

        describe("not enough validations to upgrade", () => {
            beforeEach(async () => {
                await txExec(
                    foreVerifiers
                        .connect(owner)
                        .mintWithPower(alice.address, 15000, 2, 75)
                );

                await foreVerifiers.setVariable("protocol", protocol.address);
            });

            it("Should revert with can't upgrade", async () => {
                await expect(
                    protocol.connect(alice).upgradeTier(0)
                ).to.revertedWith("ForeProtocol: Cant upgrade");
            });
        });
    });

    describe("Creating market", () => {
        it("Should revert without funds for creation fee", async () => {
            await expect(
                contract
                    .connect(alice)
                    .createMarket(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                        alice.address,
                        ethers.utils.parseEther("2"),
                        ethers.utils.parseEther("1"),
                        1653327334588,
                        1653357334588
                    )
            ).to.revertedWith("ERC20: burn amount exceeds balance");
        });

        it("Should revert if not whitelisted factory", async () => {
            await expect(
                protocol
                    .connect(alice)
                    .createMarket(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                        alice.address,
                        alice.address,
                        "0xdac17f958d2ee523a2206206994597c13d831ec7"
                    )
            ).to.revertedWith("FactoryIsNotWhitelisted");
        });

        it("Should revert in case inverse dates", async () => {
            await expect(
                contract
                    .connect(alice)
                    .createMarket(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                        alice.address,
                        ethers.utils.parseEther("2"),
                        ethers.utils.parseEther("1"),
                        1653357334588,
                        1653327334588
                    )
            ).to.revertedWith("BasicFactory: Date error");
        });

        it("Should allow in case of zero fee", async () => {
            await txExec(
                protocolConfig.connect(owner).setMarketCreationPrice(0)
            );

            await txExec(
                contract
                    .connect(alice)
                    .createMarket(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                        alice.address,
                        0,
                        0,
                        1653327334588,
                        1653357334588
                    )
            );
        });
    });

    describe("With market created", () => {
        let tx: ContractTransaction;
        let marketContract: BasicMarket;

        beforeEach(async () => {
            const marketHash =
                "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab";
            [tx] = await txExec(
                contract
                    .connect(bob)
                    .createMarket(
                        marketHash,
                        alice.address,
                        ethers.utils.parseEther("2"),
                        ethers.utils.parseEther("1"),
                        1653327334588,
                        1653357334588
                    )
            );

            const initCode = await contract.INIT_CODE_PAIR_HASH();

            const salt = marketHash;
            const newAddress = ethers.utils.getCreate2Address(
                contract.address,
                salt,
                initCode
            );

            marketContract = await attachContract<BasicMarket>(
                "BasicMarket",
                newAddress
            );
        });

        it("Should return true while checking market is operator", async () => {
            expect(
                await protocol.isForeOperator(marketContract.address)
            ).to.be.equal(true);
        });

        it("Should return true for isApprovedForAll with created market", async () => {
            expect(
                await protocol.isApprovedForAll(
                    alice.address,
                    marketContract.address
                )
            ).to.be.equal(true);
        });

        it("tokenURI() should return proper URI", async () => {
            expect(await protocol.tokenURI(0)).to.be.equal(
                "https://markets.api.foreprotocol.io/market/0"
            );
        });

        it("allMarketsLength() should be increased", async () => {
            expect(await protocol.allMarketLength()).to.be.equal(1);
        });

        it("Should not be able to create market with same hash (revert with MarketAlreadyExists)", async () => {
            await txExec(
                protocolConfig
                    .connect(owner)
                    .setFactoryStatus([owner.address], [true])
            );
            await txExec(
                protocol
                    .connect(owner)
                    .createMarket(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abbb",
                        alice.address,
                        alice.address,
                        "0xdac17f958d2ee523a2206206994597c13d831ec7"
                    )
            );
            await expect(
                protocol
                    .connect(owner)
                    .createMarket(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abbb",
                        alice.address,
                        alice.address,
                        "0xdac17f958d2ee523a2206206994597c13d831ec7"
                    )
            ).to.be.revertedWith("MarketAlreadyExists");
        });

        it("Should burn funds as creation fee (ERC20 Transfer)", async () => {
            await expect(tx)
                .to.emit(foreToken, "Transfer")
                .withArgs(
                    bob.address,
                    "0x0000000000000000000000000000000000000000",
                    ethers.utils.parseEther("10")
                );
        });

        it("Should emit token creation event (ERC721 Transfer)", async () => {
            await expect(tx)
                .to.emit(protocol, "Transfer")
                .withArgs(
                    "0x0000000000000000000000000000000000000000",
                    alice.address,
                    BigNumber.from(0)
                );
        });
    });

    describe("Supports interface", () => {
        it("does not support random interface", async () => {
            await expect(protocol.supportsInterface("0x0")).to.be.reverted;
        });

        it("does support ERC165", async () => {
            expect(await protocol.supportsInterface("0x01ffc9a7")).to.be.equal(
                true
            );
        });

        it("does support ERC721", async () => {
            expect(await protocol.supportsInterface("0x80ac58cd")).to.be.equal(
                true
            );
        });
    });
});
