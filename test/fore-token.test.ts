import { ForeMarkets } from "@/ForeMarkets";
import { FactoryChangedEvent, ForeToken } from "@/ForeToken";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import {
    assertEvent,
    assertIsAvailableOnlyForOwner,
    deployContract,
    txExec,
} from "./helpers/utils";

describe("Fore ERC20 token", function () {
    let owner: SignerWithAddress;
    let operator: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    let foreMarkets: FakeContract<ForeMarkets>;
    let contract: ForeToken;

    beforeEach(async () => {
        [owner, operator, alice, bob] = await ethers.getSigners();

        foreMarkets = await smock.fake("ForeMarkets");
        foreMarkets.isForeOperator.returns(false);
        foreMarkets.isForeOperator
            .whenCalledWith(operator.address)
            .returns(true);

        contract = await deployContract("ForeToken");
    });

    describe("Initial values", () => {
        it("Should return proper name", async () => {
            expect(await contract.name()).to.equal("ForeToken");
        });

        it("Should return proper symbol", async () => {
            expect(await contract.symbol()).to.equal("FORE");
        });

        it("Should return proper intial supply", async () => {
            expect(await contract.totalSupply()).to.equal(
                ethers.utils.parseEther("1000000000")
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

        describe("transfering", () => {
            beforeEach(async () => {
                await txExec(
                    contract
                        .connect(owner)
                        .transfer(
                            alice.address,
                            ethers.utils.parseEther("1000")
                        )
                );

                await txExec(
                    contract
                        .connect(owner)
                        .transfer(bob.address, ethers.utils.parseEther("1000"))
                );
            });

            it("Should be allowed to transfer tokens by operator", async () => {
                await txExec(
                    contract
                        .connect(operator)
                        .transferFrom(
                            alice.address,
                            operator.address,
                            ethers.utils.parseEther("10")
                        )
                );
            });

            it("Should preserve default behavior of approving in case of non operator", async () => {
                await expect(
                    contract
                        .connect(bob)
                        .transferFrom(
                            alice.address,
                            operator.address,
                            ethers.utils.parseEther("10")
                        )
                ).to.be.revertedWith("ERC20: insufficient allowance");
            });
        });
    });
});
