import { ForeMarket } from "@/ForeMarket";
import { ForeMarkets, MarketCreatedEvent } from "@/ForeMarkets";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers } from "@/ForeVerifiers";
import { ProtocolConfig } from "@/ProtocolConfig";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";
import { ContractReceipt } from "@ethersproject/contracts/src.ts/index";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, ContractTransaction } from "ethers";
import { ethers } from "hardhat";
import {
    attachContract,
    deployContract,
    deployMockedContract,
    findEvent,
    txExec,
} from "./helpers/utils";

describe("ForeMarkets", () => {
    let owner: SignerWithAddress;
    let foundationWallet: SignerWithAddress;
    let revenueWallet: SignerWithAddress;
    let highGuardAccount: SignerWithAddress;
    let marketplaceContract: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    let protocolConfig: ProtocolConfig;
    let foreToken: MockContract<ForeToken>;
    let foreVerifiers: MockContract<ForeVerifiers>;
    let contract: ForeMarkets;

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

        foreToken = await deployMockedContract<ForeToken>("ForeToken");
        foreVerifiers = await deployMockedContract<ForeVerifiers>(
            "ForeVerifiers"
        );

        protocolConfig = await deployContract<ProtocolConfig>(
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

        contract = await deployContract<ForeMarkets>(
            "ForeMarkets",
            protocolConfig.address
        );

        await txExec(foreToken.setFactory(contract.address));
        await txExec(foreVerifiers.setFactory(contract.address));

        await txExec(
            foreToken
                .connect(owner)
                .transfer(bob.address, ethers.utils.parseEther("1000"))
        );
    });

    describe("Initial state", () => {
        it("Should expose proper name", async () => {
            expect(await contract.name()).to.be.equal("Fore Markets");
        });

        it("Should expose proper symbol", async () => {
            expect(await contract.symbol()).to.be.equal("MFORE");
        });

        it("Should use fallback for isApprovedForAll with any account", async () => {
            expect(
                await contract.isApprovedForAll(alice.address, bob.address)
            ).to.be.equal(false);
        });

        it("allMarketsLength() should be increased", async () => {
            expect(await contract.allMarketLength()).to.be.equal(0);
        });
    });

    describe("For non created token", () => {
        it("tokenURI() should revert", async () => {
            await expect(contract.tokenURI(1)).to.be.revertedWith(
                "Non minted token"
            );
        });
    });

    describe("Fore operator verification", () => {
        it("Should return false for sample account", async () => {
            expect(await contract.isForeOperator(alice.address)).to.be.equal(
                false
            );
        });

        it("Should return true for marketplace", async () => {
            expect(
                await contract.isForeOperator(marketplaceContract.address)
            ).to.be.equal(true);
        });

        it("Should return true for factory", async () => {
            expect(await contract.isForeOperator(contract.address)).to.be.equal(
                true
            );
        });
    });

    describe("Minting verifier NFT", () => {
        it("Should revert without funds for minting fee", async () => {
            await expect(
                contract.connect(alice).mintVerifier(bob.address)
            ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });

        describe("sucessfully", () => {
            let tx: ContractTransaction;
            let recipt: ContractReceipt;

            beforeEach(async () => {
                [tx, recipt] = await txExec(
                    contract.connect(bob).mintVerifier(alice.address)
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
            await txExec(contract.connect(bob).mintVerifier(alice.address));
            await txExec(
                protocolConfig.setVerifierMintPrice(
                    ethers.utils.parseEther("100")
                )
            );
        });

        it("Should revert without funds for buying power", async () => {
            await expect(
                contract
                    .connect(alice)
                    .buyPower(0, ethers.utils.parseEther("80"))
            ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });

        it("Should revert without funds for buying power", async () => {
            await expect(
                contract.connect(bob).buyPower(0, ethers.utils.parseEther("81"))
            ).to.be.revertedWith("ForeFactory: Buy limit reached");
        });

        describe("sucessfully", () => {
            let tx: ContractTransaction;
            let recipt: ContractReceipt;

            beforeEach(async () => {
                [tx, recipt] = await txExec(
                    contract
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

            it("Should call foreVerifiers.mintWithPower()", async () => {
                expect(foreVerifiers.increasePower.getCall(0).args).to.be.eql([
                    BigNumber.from(0),
                    ethers.utils.parseEther("80"),
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

        it("Should revert in case inversed dates", async () => {
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
            ).to.revertedWith("ForeMarkets: Date error");
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
        let recipt: ContractReceipt;

        let marketContract: ForeMarket;

        beforeEach(async () => {
            [tx, recipt] = await txExec(
                contract
                    .connect(bob)
                    .createMarket(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                        alice.address,
                        ethers.utils.parseEther("2"),
                        ethers.utils.parseEther("1"),
                        1653327334588,
                        1653357334588
                    )
            );

            const creationEvent = findEvent<MarketCreatedEvent>(
                recipt,
                "MarketCreated"
            );
            marketContract = await attachContract<ForeMarket>(
                "ForeMarket",
                creationEvent.args.market
            );
        });

        it("Should return true while checking market is operator", async () => {
            expect(
                await contract.isForeOperator(marketContract.address)
            ).to.be.equal(true);
        });

        it("Should return true for isApprovedForAll with created market", async () => {
            expect(
                await contract.isApprovedForAll(
                    alice.address,
                    marketContract.address
                )
            ).to.be.equal(true);
        });

        it("tokenURI() should return proper URI", async () => {
            expect(await contract.tokenURI(0)).to.be.equal(
                "https://markets.api.foreprotocol.io/market/0"
            );
        });

        it("allMarketsLength() should be increased", async () => {
            expect(await contract.allMarketLength()).to.be.equal(1);
        });

        it("Should not be able to create market with same hash (revert with MarketAlreadyExists)", async () => {
            await expect(
                contract
                    .connect(bob)
                    .createMarket(
                        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                        alice.address,
                        ethers.utils.parseEther("2"),
                        ethers.utils.parseEther("1"),
                        1653327334588,
                        1653357334588
                    )
            ).to.be.revertedWith("MarketAlreadyExists()");
        });

        it("Should call foreToken.transfer()", async () => {
            expect(foreToken.transferFrom.getCall(0).args).to.be.eql([
                bob.address,
                marketContract.address,
                ethers.utils.parseEther("3"),
            ]);
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

        it("Should transfer funds to market as votes (ERC20 Transfer)", async () => {
            await expect(tx)
                .to.emit(foreToken, "Transfer")
                .withArgs(
                    bob.address,
                    marketContract.address,
                    ethers.utils.parseEther("3")
                );
        });

        it("Should emit token creation event (ERC721 Transfer)", async () => {
            await expect(tx)
                .to.emit(contract, "Transfer")
                .withArgs(
                    "0x0000000000000000000000000000000000000000",
                    alice.address,
                    BigNumber.from(0)
                );
        });
    });
});
