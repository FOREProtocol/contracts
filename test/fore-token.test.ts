import { ProtocolChangedEvent, ForeToken } from "@/ForeToken";
import { ForeProtocol } from "@/ForeProtocol";
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

    let foreProtocol: FakeContract<ForeProtocol>;
    let contract: ForeToken;

    beforeEach(async () => {
        [owner, operator, alice, bob] = await ethers.getSigners();

        foreProtocol = await smock.fake("ForeProtocol");
        foreProtocol.isForeOperator.returns(false);
        foreProtocol.isForeOperator
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
                addr: foreProtocol.address,
            });
        });

        describe("successfully", () => {
            beforeEach(async () => {
                await txExec(
                    contract.connect(owner).setProtocol(foreProtocol.address)
                );
            });

            it("Should not allow to change protocol again", async () => {
                await expect(
                    contract.connect(owner).setProtocol(foreProtocol.address)
                ).to.be.revertedWith("ProtocolAlreadySet()");
            });

            it("Should return proper protocol address", async () => {
                expect(await contract.protocol()).to.be.equal(
                    foreProtocol.address
                );
            });
        });
    });

    describe("with protocol configured", () => {
        beforeEach(async () => {
            await txExec(
                contract.connect(owner).setProtocol(foreProtocol.address)
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
