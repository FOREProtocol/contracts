import { TransferEvent } from "@/ERC721";
import { ForeProtocol } from "@/ForeProtocol";
import { ForeToken } from "@/ForeToken";
import {
    ProtocolChangedEvent,
    ForeVerifiers,
    TokenPowerDecreasedEvent,
    TokenPowerIncreasedEvent,
    TransferAllowanceChangedEvent,
    TokenValidationIncreasedEvent,
    BaseURIEvent,
} from "@/ForeVerifiers";
import { ProtocolConfig } from "@/ProtocolConfig";
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

describe("Fore NFT Verifiers token", () => {
    let owner: SignerWithAddress;
    let market: SignerWithAddress;
    let operator: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    let contract: ForeVerifiers;
    let foreToken: FakeContract<ForeToken>;
    let foreProtocol: FakeContract<ForeProtocol>;
    let config: FakeContract<ProtocolConfig>;

    beforeEach(async () => {
        [owner, alice, bob, market, operator] = await ethers.getSigners();

        contract = await deployContract<ForeVerifiers>(
            "ForeVerifiers",
            "https://nft.api.foreprotocol.io/token/"
        );

        config = await smock.fake<ProtocolConfig>("ProtocolConfig");

        foreToken = await smock.fake<ForeToken>("ForeToken");
        foreToken.transfer.returns(true);

        foreProtocol = await smock.fake<ForeProtocol>("ForeProtocol");
        foreProtocol.foreToken.returns(foreToken.address);
        foreProtocol.isForeMarket.returns(false);
        foreProtocol.isForeMarket.whenCalledWith(market.address).returns(true);
        foreProtocol.isForeOperator.returns(false);
        foreProtocol.isForeOperator
            .whenCalledWith(operator.address)
            .returns(true);
        foreProtocol.isForeOperator
            .whenCalledWith(market.address)
            .returns(true);
        foreProtocol.config.returns(config.address);
        config.getTierMultiplier.whenCalledWith(0).returns(10000);

        // add some eth to mocked contract
        await txExec(
            owner.sendTransaction({
                value: ethers.utils.parseEther("10"),
                to: foreProtocol.address,
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
                "ERC721: invalid token ID"
            );
        });

        it("Should revert while trying to increase power", async () => {
            await expect(
                contract.increasePower(123, 10, false)
            ).to.be.revertedWith("TokenNotExists()");
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

    describe("Change protocol contract address", () => {
        it("Should allow to execute only by owner", async () => {
            await assertIsAvailableOnlyForOwner(async (account) => {
                return contract
                    .connect(account)
                    .setProtocol(foreProtocol.address);
            });
        });

        it("Should emit ProtocolChanged event", async () => {
            const [tx, recipt] = await txExec(
                contract.connect(owner).setProtocol(foreProtocol.address)
            );

            assertEvent<ProtocolChangedEvent>(recipt, "ProtocolChanged", {
                newAddress: foreProtocol.address,
            });
        });

        describe("successfully", () => {
            beforeEach(async () => {
                await txExec(
                    contract.connect(owner).setProtocol(foreProtocol.address)
                );
            });

            it("Should not allow to change protocol to zero", async () => {
                await expect(
                    contract
                        .connect(owner)
                        .setProtocol(ethers.constants.AddressZero)
                ).to.be.revertedWith(
                    "ForeVerifiers: Procotol address cannot be zero"
                );
            });

            it("Should return proper protocol address", async () => {
                expect(await contract.protocol()).to.be.equal(
                    foreProtocol.address
                );
            });
        });
    });

    describe("Change base uri", () => {
        it("Should allow to execute only by owner", async () => {
            await assertIsAvailableOnlyForOwner(async (account) => {
                return contract
                    .connect(account)
                    .editBaseUri("https://test.com/%.json");
            });
        });

        it("Should emit BaseURI event", async () => {
            const [tx, recipt] = await txExec(
                contract.connect(owner).editBaseUri("https://test.com/%.json")
            );

            assertEvent<BaseURIEvent>(recipt, "BaseURI", {
                value: "https://test.com/%.json",
            });
        });
    });

    describe("with protocol configured", () => {
        beforeEach(async () => {
            await txExec(
                contract.connect(owner).setProtocol(foreProtocol.address)
            );
        });

        describe("Minting new tokens", () => {
            it("Should allow to execute only by protocol", async () => {
                await assertIsAvailableOnlyForOwner(
                    async (account) => {
                        return contract
                            .connect(account)
                            .mintWithPower(alice.address, 10, 0, 0);
                    },
                    foreProtocol.wallet,
                    "OnlyProtocolAllowed()"
                );
            });

            describe("successfully", () => {
                let tx: ContractTransaction;
                let recipt: ContractReceipt;

                beforeEach(async () => {
                    [tx, recipt] = await txExec(
                        contract
                            .connect(foreProtocol.wallet)
                            .mintWithPower(alice.address, 10, 0, 0)
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

                it("Should have proper muliplied power", async () => {
                    expect(await contract.multipliedPowerOf(0)).to.be.equal(10);
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
                        .connect(foreProtocol.wallet)
                        .mintWithPower(alice.address, 10, 0, 0)
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
                                .increasePower(0, 10, true);
                        },
                        market,
                        "OnlyOperatorAllowed()"
                    );
                });

                describe("successfully", () => {
                    let tx: ContractTransaction;
                    let recipt: ContractReceipt;

                    beforeEach(async () => {
                        [tx, recipt] = await txExec(
                            contract.connect(market).increasePower(0, 10, false)
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
                    await txExec(
                        contract.connect(market).increasePower(0, 10, false)
                    );
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

                describe("successfully", () => {
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

                describe("successfully applying penalty", () => {
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

                describe("successfully burning", () => {
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
                            .connect(foreProtocol.wallet)
                            .mintWithPower(operator.address, 10, 0, 0)
                    );
                });

                it("Should check approval ", async () => {
                    const bobHasApproval = await contract.isApprovedForAll(
                        alice.address,
                        bob.address
                    );
                    expect(bobHasApproval).to.be.equal(false);
                });

                it("Should not be allowed to transfer tokens by default", async () => {
                    await expect(
                        contract
                            .connect(alice)
                            .transferFrom(alice.address, bob.address, 0)
                    ).to.be.revertedWith("TransferAllowedOnlyForOperator()");
                });

                describe("with transferability enabled", () => {
                    beforeEach(async () => {
                        await txExec(
                            contract
                                .connect(foreProtocol.wallet)
                                .mintWithPower(operator.address, 10, 0, 0)
                        );

                        await txExec(
                            contract.connect(owner).setTransferAllowance(true)
                        );
                    });

                    it("Should be allowed to transfer tokens to operator", async () => {
                        await txExec(
                            contract
                                .connect(alice)
                                .transferFrom(
                                    alice.address,
                                    operator.address,
                                    0
                                )
                        );
                    });

                    it("Should be allowed to transfer tokens from operator", async () => {
                        await txExec(
                            contract
                                .connect(operator)
                                .transferFrom(operator.address, bob.address, 1)
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

        describe("increasing validations", () => {
            describe("with token minted", () => {
                beforeEach(async () => {
                    await txExec(
                        contract
                            .connect(foreProtocol.wallet)
                            .mintWithPower(alice.address, 10, 0, 0)
                    );
                });

                it("Only market can increase validations", async () => {
                    await assertIsAvailableOnlyForOwner(
                        async (account) => {
                            return contract
                                .connect(account)
                                .increaseValidation(0);
                        },
                        market,
                        "OnlyOperatorAllowed()"
                    );
                });

                describe("successfully", () => {
                    let tx: ContractTransaction;
                    let recipt: ContractReceipt;

                    beforeEach(async () => {
                        [tx, recipt] = await txExec(
                            contract.connect(market).increaseValidation(0)
                        );
                    });

                    it("Should emit TokenValidationIncreased event", async () => {
                        assertEvent<TokenValidationIncreasedEvent>(
                            recipt,
                            "TokenValidationIncreased",
                            {
                                id: BigNumber.from(0),
                                newValidationCount: BigNumber.from(1),
                            }
                        );
                    });

                    it("Should revert with wrong token id", async () => {
                        await expect(
                            contract.connect(market).increaseValidation(1)
                        ).to.be.revertedWith("TokenNotExists");
                    });
                });
            });
        });
    });

    describe("Supports interface", () => {
        it("does not support random interface", async () => {
            await expect(contract.supportsInterface("0x0")).to.be.reverted;
        });

        it("does support ERC165", async () => {
            expect(await contract.supportsInterface("0x01ffc9a7")).to.be.equal(
                true
            );
        });

        it("does support ERC721", async () => {
            expect(await contract.supportsInterface("0x80ac58cd")).to.be.equal(
                true
            );
        });
    });
});
