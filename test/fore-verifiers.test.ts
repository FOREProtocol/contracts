import { TransferEvent } from "@/ERC721";
import { ForeMarkets } from "@/ForeMarkets";
import { ForeToken } from "@/ForeToken";
import {
    FactoryChangedEvent,
    ForeVerifiers,
    TokenPowerDecreasedEvent,
    TokenPowerIncreasedEvent,
    TransferAllowanceChangedEvent,
} from "@/ForeVerifiers";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { ContractReceipt } from "@ethersproject/contracts/src.ts/index";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, ContractTransaction } from "ethers";
import { ethers } from "hardhat";
import {
    assertEvent,
    assertIsAvailableOnlyForOwner,
    deployContract,
    txExec,
} from "./helpers/utils";

xdescribe("Fore NFT Verifiers token", () => {
    let owner: SignerWithAddress;
    let market: SignerWithAddress;
    let operator: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    let contract: ForeVerifiers;
    let foreToken: FakeContract<ForeToken>;
    let foreMarkets: FakeContract<ForeMarkets>;

    beforeEach(async () => {
        [owner, market, operator, alice, bob] = await ethers.getSigners();

        contract = await deployContract<ForeVerifiers>("ForeVerifiers");

        foreToken = await smock.fake<ForeToken>("ForeToken");
        foreToken.transfer.returns(true);

        foreMarkets = await smock.fake<ForeMarkets>("ForeMarkets");
        foreMarkets.foreToken.returns(foreToken.address);
        foreMarkets.isForeMarket.returns(false);
        foreMarkets.isForeMarket.whenCalledWith(market.address).returns(true);
        foreMarkets.isForeOperator.returns(false);
        foreMarkets.isForeOperator
            .whenCalledWith(operator.address)
            .returns(true);

        // add some eth to mocked contract
        await txExec(
            owner.sendTransaction({
                value: ethers.utils.parseEther("10"),
                to: foreMarkets.address,
            })
        );
    });

    describe("Initial state", () => {
        it("Should expose proper name", async () => {
            expect(await contract.name()).to.be.equal("ForeNFT");
        });

        it("Should expose proper symbol", async () => {
            expect(await contract.symbol()).to.be.equal("FORE");
        });

        it("Should disable transfers by default", async () => {
            expect(await contract.transfersAllowed()).to.be.equal(false);
        });
    });

    describe("For non existing token", () => {
        it("Should revert while checking token URI", async () => {
            await expect(contract.tokenURI(123)).to.be.revertedWith(
                "ERC721Metadata: URI query for nonexistent token"
            );
        });

        it("Should revert while trying to increase power", async () => {
            await expect(contract.increasePower(123, 10)).to.be.revertedWith(
                "TokenNotExists()"
            );
        });

        it("Should revert while trying to decrease power", async () => {
            await expect(contract.decreasePower(123, 10)).to.be.revertedWith(
                "TokenNotExists()"
            );
        });
    });

    describe("Change transferability", () => {
        it("Should allow to execute only by owner", async () => {
            await assertIsAvailableOnlyForOwner(async (account) => {
                return contract.connect(account).setTransferAllowance(true);
            });
        });

        it("Should emit TransferAllowanceChanged event", async () => {
            const [tx, recipt] = await txExec(
                contract.connect(owner).setTransferAllowance(true)
            );

            assertEvent<TransferAllowanceChangedEvent>(
                recipt,
                "TransferAllowanceChanged",
                {
                    status: true,
                }
            );
        });
    });

    describe("Change factory contract address", () => {
        it("Should allow to execute only by owner", async () => {
            await assertIsAvailableOnlyForOwner(async (account) => {
                return contract
                    .connect(account)
                    .setFactory(foreMarkets.address);
            });
        });

        it("Should emit FactoryChanged event", async () => {
            const [tx, recipt] = await txExec(
                contract.connect(owner).setFactory(foreMarkets.address)
            );

            assertEvent<FactoryChangedEvent>(recipt, "FactoryChanged", {
                addr: foreMarkets.address,
            });
        });

        describe("successfully", () => {
            beforeEach(async () => {
                await txExec(
                    contract.connect(owner).setFactory(foreMarkets.address)
                );
            });

            it("Should not allow to change factory again", async () => {
                await expect(
                    contract.connect(owner).setFactory(foreMarkets.address)
                ).to.be.revertedWith("FactoryAlreadySet()");
            });

            it("Should return proper factory address", async () => {
                expect(await contract.factory()).to.be.equal(
                    foreMarkets.address
                );
            });
        });
    });

    describe("with factory configured", () => {
        beforeEach(async () => {
            await txExec(
                contract.connect(owner).setFactory(foreMarkets.address)
            );
        });

        describe("Minting new tokens", () => {
            it("Should allow to execute only by factory", async () => {
                await assertIsAvailableOnlyForOwner(
                    async (account) => {
                        return contract
                            .connect(account)
                            .mintWithPower(alice.address, 10);
                    },
                    foreMarkets.wallet,
                    "OnlyFactoryAllowed()"
                );
            });

            describe("successfully", () => {
                let tx: ContractTransaction;
                let recipt: ContractReceipt;

                beforeEach(async () => {
                    [tx, recipt] = await txExec(
                        contract
                            .connect(foreMarkets.wallet)
                            .mintWithPower(alice.address, 10)
                    );
                });

                it("Should emit Transfer (mint) event", async () => {
                    assertEvent<TransferEvent>(recipt, "Transfer", {
                        from: "0x0000000000000000000000000000000000000000",
                        to: alice.address,
                        tokenId: BigNumber.from(0),
                    });
                });

                it("Should have proper power", async () => {
                    expect(await contract.powerOf(0)).to.be.equal(10);
                });

                it("Should have proper initial power", async () => {
                    expect(await contract.initialPowerOf(0)).to.be.equal(10);
                });

                it("Should increase height", async () => {
                    expect(await contract.height()).to.be.equal(1);
                });
            });
        });

        describe("with token minted", () => {
            beforeEach(async () => {
                await txExec(
                    contract
                        .connect(foreMarkets.wallet)
                        .mintWithPower(alice.address, 10)
                );
            });

            it("Should return proper URL", async () => {
                expect(await contract.tokenURI(0)).to.be.equal(
                    "https://nft.api.foreprotocol.io/token/0"
                );
            });

            describe("increasing power", () => {
                it("Only market can increase power", async () => {
                    await assertIsAvailableOnlyForOwner(
                        async (account) => {
                            return contract
                                .connect(account)
                                .increasePower(0, 10);
                        },
                        market,
                        "OnlyMarketAllowed()"
                    );
                });

                describe("successfully", () => {
                    let tx: ContractTransaction;
                    let recipt: ContractReceipt;

                    beforeEach(async () => {
                        [tx, recipt] = await txExec(
                            contract.connect(market).increasePower(0, 10)
                        );
                    });

                    it("Should emit TokenPowerIncreased event", async () => {
                        assertEvent<TokenPowerIncreasedEvent>(
                            recipt,
                            "TokenPowerIncreased",
                            {
                                id: BigNumber.from(0),
                                powerDelta: BigNumber.from(10),
                                newPower: BigNumber.from(20),
                            }
                        );
                    });

                    it("Should have proper power", async () => {
                        expect(await contract.powerOf(0)).to.be.equal(20);
                    });
                });
            });

            describe("decreasing power by token owner (withdrawal)", () => {
                beforeEach(async () => {
                    await txExec(contract.connect(market).increasePower(0, 10));
                });

                it("Should be larger than 0", async () => {
                    await expect(
                        contract.connect(alice).decreasePower(0, 0)
                    ).to.be.revertedWith("NothingToWithdraw()");
                });

                it("Should not allow to execute by non owner nor market", async () => {
                    await expect(
                        contract.connect(bob).decreasePower(0, 10)
                    ).to.be.revertedWith("NotAuthorized()");
                });

                it("Should be limited to increased value", async () => {
                    await expect(
                        contract.connect(alice).decreasePower(0, 11)
                    ).to.be.revertedWith("AmountExceedLimit(10)");
                });

                describe("successfully", async () => {
                    let tx: ContractTransaction;
                    let recipt: ContractReceipt;

                    beforeEach(async () => {
                        [tx, recipt] = await txExec(
                            contract.connect(alice).decreasePower(0, 10)
                        );
                    });

                    it("Should emit TokenPowerDecreased event", async () => {
                        assertEvent<TokenPowerDecreasedEvent>(
                            recipt,
                            "TokenPowerDecreased",
                            {
                                id: BigNumber.from(0),
                                powerDelta: BigNumber.from(10),
                                newPower: BigNumber.from(10),
                            }
                        );
                    });

                    it("Should have proper power", async () => {
                        expect(await contract.powerOf(0)).to.be.equal(10);
                    });
                });
            });

            describe("decreasing power by market (penalty)", () => {
                it("Should be limited to current power", async () => {
                    await expect(
                        contract.connect(market).decreasePower(0, 11)
                    ).to.be.revertedWith("AmountExceedLimit(10)");
                });

                describe("successfully applying penalty", async () => {
                    let tx: ContractTransaction;
                    let recipt: ContractReceipt;

                    beforeEach(async () => {
                        [tx, recipt] = await txExec(
                            contract.connect(market).decreasePower(0, 5)
                        );
                    });

                    it("Should emit TokenPowerDecreased event", async () => {
                        assertEvent<TokenPowerDecreasedEvent>(
                            recipt,
                            "TokenPowerDecreased",
                            {
                                id: BigNumber.from(0),
                                powerDelta: BigNumber.from(5),
                                newPower: BigNumber.from(5),
                            }
                        );
                    });

                    it("Should have proper power", async () => {
                        expect(await contract.powerOf(0)).to.be.equal(5);
                    });

                    it("Should call ERC20 transfer", async () => {
                        expect(foreToken.transfer.getCall(0).args).to.be.eql([
                            market.address,
                            BigNumber.from(5),
                        ]);
                    });
                });

                describe("successfully burning", async () => {
                    let tx: ContractTransaction;
                    let recipt: ContractReceipt;

                    beforeEach(async () => {
                        [tx, recipt] = await txExec(
                            contract.connect(market).decreasePower(0, 10)
                        );
                    });

                    it("Should emit TokenPowerDecreased event", async () => {
                        assertEvent<TokenPowerDecreasedEvent>(
                            recipt,
                            "TokenPowerDecreased",
                            {
                                id: BigNumber.from(0),
                                powerDelta: BigNumber.from(10),
                                newPower: BigNumber.from(0),
                            }
                        );
                    });

                    it("Should emit Transfer (burn) event", async () => {
                        assertEvent<TransferEvent>(recipt, "Transfer", {
                            from: alice.address,
                            to: "0x0000000000000000000000000000000000000000",
                            tokenId: BigNumber.from(0),
                        });
                    });

                    it("Should have proper power", async () => {
                        expect(await contract.powerOf(0)).to.be.equal(0);
                    });

                    it("Should call ERC20 transfer", async () => {
                        expect(foreToken.transfer.getCall(0).args).to.be.eql([
                            market.address,
                            BigNumber.from(10),
                        ]);
                    });
                });
            });

            describe("transfering", () => {
                beforeEach(async () => {
                    await txExec(
                        contract
                            .connect(foreMarkets.wallet)
                            .mintWithPower(operator.address, 10)
                    );
                });

                it("Should be allowed to transfer tokens by operator", async () => {
                    await txExec(
                        contract
                            .connect(operator)
                            .transferFrom(alice.address, operator.address, 0)
                    );
                });

                it("Should preserve default behavior of approving in case of non operator", async () => {
                    await expect(
                        contract
                            .connect(bob)
                            .transferFrom(alice.address, operator.address, 0)
                    ).to.be.revertedWith(
                        "ERC721: transfer caller is not owner nor approved"
                    );
                });

                it("Should not be allowed to transfer tokens by default", async () => {
                    await expect(
                        contract
                            .connect(alice)
                            .transferFrom(alice.address, bob.address, 0)
                    ).to.be.revertedWith("TransferAllowedOnlyForOperator()");
                });

                it("Should be allowed to transfer tokens to operator", async () => {
                    await txExec(
                        contract
                            .connect(alice)
                            .transferFrom(alice.address, operator.address, 0)
                    );
                });

                it("Should be allowed to transfer tokens from operator", async () => {
                    await txExec(
                        contract
                            .connect(operator)
                            .transferFrom(operator.address, bob.address, 1)
                    );
                });

                describe("with transferability enabled", () => {
                    beforeEach(async () => {
                        await txExec(
                            contract.connect(owner).setTransferAllowance(true)
                        );
                    });

                    it("Should be allowed to transfer tokens", async () => {
                        await txExec(
                            contract
                                .connect(alice)
                                .transferFrom(alice.address, bob.address, 0)
                        );
                    });
                });
            });
        });
    });
});
