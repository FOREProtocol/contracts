import { ForeToken } from "@/ForeToken";
import { ForeVesting } from "@/ForeVesting";
import { ContractReceipt } from "@ethersproject/contracts/src.ts/index";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, ContractTransaction } from "ethers";
import { ethers } from "hardhat";
import {
    assertIsAvailableOnlyForOwner,
    deployContract,
    timetravel,
    txExec,
} from "./helpers/utils";

describe("Fore ERC20 token vesting", function () {
    let owner: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    let contract: ForeVesting;
    let foreToken: ForeToken;

    let blockTimestamp: number;

    beforeEach(async () => {
        [owner, alice, bob] = await ethers.getSigners();

        foreToken = await deployContract("ForeToken");
        contract = await deployContract("ForeVesting", foreToken.address);

        const previousBlock = await ethers.provider.getBlock("latest");
        blockTimestamp = previousBlock.timestamp;
    });

    describe("Initial values", () => {
        it("Should return zero slots", async () => {
            expect(await contract.slotsOf(alice.address)).to.equal(0);
        });

        it("Should return empty vesting info", async () => {
            expect(await contract.vestingInfo(alice.address, 0)).to.eql([
                BigNumber.from(0),
                BigNumber.from(0),
                BigNumber.from(0),
                BigNumber.from(0),
                BigNumber.from(0),
            ]);
        });

        it("Should return zero amount available to claim", async () => {
            expect(await contract.available(alice.address, 0)).to.equal(0);
        });

        it("Should revert with VestingNotFound error", async () => {
            await expect(
                contract.connect(alice).withdraw(0)
            ).to.be.revertedWith("VestingNotFound()");
        });
    });

    it("Should revert without require allowance", async () => {
        const amount = ethers.utils.parseEther("10");

        await expect(
            contract
                .connect(owner)
                .addAddresses(
                    [alice.address],
                    [amount],
                    [blockTimestamp + 10000],
                    [blockTimestamp + 50000],
                    [0]
                )
        ).to.be.revertedWith(`InsufficientBalanceOrAllowance(${amount})`);
    });

    describe("with spending allowance", () => {
        beforeEach(async () => {
            await txExec(
                foreToken
                    .connect(owner)
                    .approve(contract.address, ethers.utils.parseEther("100"))
            );
        });

        describe("Adding vesting informations", () => {
            it("Should allow to execute only by owner", async () => {
                await assertIsAvailableOnlyForOwner(async (account) => {
                    return contract
                        .connect(account)
                        .addAddresses(
                            [alice.address],
                            [ethers.utils.parseEther("10")],
                            [blockTimestamp + 10000],
                            [blockTimestamp + 50000],
                            [0]
                        );
                });
            });

            it("Should fail with wrongly prepared arrays", async () => {
                await expect(
                    contract
                        .connect(owner)
                        .addAddresses(
                            [alice.address, bob.address],
                            [ethers.utils.parseEther("10")],
                            [blockTimestamp + 10000],
                            [blockTimestamp + 50000],
                            [0]
                        )
                ).to.be.revertedWith("ArrayLengthsMismatch(2)");
            });

            describe("successfully", () => {
                let tx: ContractTransaction;
                let recipt: ContractReceipt;

                beforeEach(async () => {
                    [tx, recipt] = await txExec(
                        contract
                            .connect(owner)
                            .addAddresses(
                                [alice.address, bob.address, alice.address],
                                [
                                    ethers.utils.parseEther("10"),
                                    ethers.utils.parseEther("20"),
                                    ethers.utils.parseEther("5"),
                                ],
                                [
                                    blockTimestamp + 10000,
                                    blockTimestamp + 10000,
                                    blockTimestamp + 20000,
                                ],
                                [
                                    blockTimestamp + 50000,
                                    blockTimestamp + 50000,
                                    blockTimestamp + 100000,
                                ],
                                [0, ethers.utils.parseEther("5"), 0]
                            )
                    );
                });

                it("Should emit Transfer event", async () => {
                    await expect(tx)
                        .to.emit(foreToken, "Transfer")
                        .withArgs(
                            owner.address,
                            contract.address,
                            ethers.utils.parseEther("35")
                        );
                });

                it("Should return proper slots info", async () => {
                    expect(await contract.slotsOf(alice.address)).to.be.equal(
                        2
                    );
                    expect(await contract.slotsOf(bob.address)).to.be.equal(1);
                });

                it("Should return proper vesting info", async () => {
                    expect(await contract.vestingInfo(alice.address, 1)).to.eql(
                        [
                            ethers.utils.parseEther("5"),
                            ethers.utils.parseEther("5"),
                            BigNumber.from(0),
                            BigNumber.from(blockTimestamp + 20000),
                            BigNumber.from(blockTimestamp + 100000),
                        ]
                    );
                    expect(await contract.vestingInfo(bob.address, 0)).to.eql([
                        ethers.utils.parseEther("20"),
                        ethers.utils.parseEther("20"),
                        ethers.utils.parseEther("5"),
                        BigNumber.from(blockTimestamp + 10000),
                        BigNumber.from(blockTimestamp + 50000),
                    ]);
                });

                it("Should return proper amount available to claim", async () => {
                    expect(await contract.available(alice.address, 0)).to.equal(
                        0
                    );
                    expect(await contract.available(bob.address, 0)).to.equal(
                        ethers.utils.parseEther("5")
                    );
                });
            });
        });
    });

    describe("with vesting prepared", () => {
        beforeEach(async () => {
            await txExec(
                foreToken
                    .connect(owner)
                    .approve(contract.address, ethers.utils.parseEther("100"))
            );

            await txExec(
                contract
                    .connect(owner)
                    .addAddresses(
                        [alice.address, bob.address, alice.address],
                        [
                            ethers.utils.parseEther("10"),
                            ethers.utils.parseEther("20"),
                            ethers.utils.parseEther("5"),
                        ],
                        [
                            blockTimestamp + 10000,
                            blockTimestamp + 10000,
                            blockTimestamp + 20000,
                        ],
                        [
                            blockTimestamp + 50000,
                            blockTimestamp + 50000,
                            blockTimestamp + 100000,
                        ],
                        [0, ethers.utils.parseEther("5"), 0]
                    )
            );
        });

        it("Should revert with VestingNotFound error", async () => {
            await expect(
                contract.connect(alice).withdraw(0)
            ).to.be.revertedWith("VestingNotStartedYet()");
        });

        describe("Withdraw initial vesting", () => {
            let tx: ContractTransaction;
            let recipt: ContractReceipt;

            beforeEach(async () => {
                await timetravel(blockTimestamp + 10000);
                [tx, recipt] = await txExec(contract.connect(bob).withdraw(0));
            });

            it("Should emit Transfer event", async () => {
                await expect(tx)
                    .to.emit(foreToken, "Transfer")
                    .withArgs(
                        contract.address,
                        bob.address,
                        ethers.utils.parseEther("5")
                    );
            });
        });
    });
});
