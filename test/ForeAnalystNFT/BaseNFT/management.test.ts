import {
    BaseURIChangedEvent,
    ForeAnalystNFT,
    TokenPenaltyChangedEvent,
} from "@/ForeAnalystNFT";
import { ContractReceipt } from "@ethersproject/contracts/src.ts/index";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import * as makeInterfaceId from "@openzeppelin/test-helpers/src/makeInterfaceId";
import { expect } from "chai";
import { BigNumber, ContractTransaction } from "ethers";
import { ethers } from "hardhat";
import {
    deployContract,
    assertIsAvailableOnlyForOwner,
    findEvent,
    txExec,
    assertEvent,
} from "../../helpers/utils";

describe("ForeAnalystNFT / BaseNFT / Management", () => {
    let owner: SignerWithAddress;
    let alice: SignerWithAddress;

    let contract: ForeAnalystNFT;

    beforeEach(async () => {
        contract = await deployContract<ForeAnalystNFT>("ForeAnalystNFT");
        [owner, alice] = await ethers.getSigners();
    });

    describe("Token info", () => {
        it("Should expose proper initial values", async () => {
            const name = await contract.name();
            expect(name).to.be.equal("ForeAnalystNFT");

            const symbol = await contract.symbol();
            expect(symbol).to.be.equal("FORE");

            const baseURI = await contract.getBaseURI();
            expect(baseURI).to.be.equal("http://example.com/r/");
        });
    });

    describe("Change base URI", () => {
        const newURL = "https://other.eth/t/";

        it("Should allow to execute only by owner", async () => {
            await assertIsAvailableOnlyForOwner(async (account) => {
                return contract.connect(account).setBaseURI(newURL);
            });
        });

        describe("successfully", () => {
            let tx: ContractTransaction;
            let recipt: ContractReceipt;

            beforeEach(async () => {
                [tx, recipt] = await txExec(
                    contract.connect(owner).setBaseURI(newURL)
                );
            });

            it("Should emit event", async () => {
                assertEvent<BaseURIChangedEvent>(recipt, "BaseURIChanged", {
                    baseURI: newURL,
                });
            });

            it("Should update state", async () => {
                expect(await contract.getBaseURI()).to.be.equal(newURL);
            });
        });
    });

    describe("Change token penalty", () => {
        it("Should fail for non existing token", async () => {
            await expect(
                contract.connect(owner).setTokenPenalty(0, 100)
            ).to.be.revertedWith("TokenNotExist()");
        });

        describe("with existing token", () => {
            beforeEach(async () => {
                await txExec(
                    contract.connect(owner).mint(alice.address, {
                        staked: ethers.utils.parseUnits("1", "ether"),
                        penalty: 10,
                    })
                );
            });

            it("Should allow to execute only by owner", async () => {
                await assertIsAvailableOnlyForOwner(async (account) => {
                    return contract.connect(account).setTokenPenalty(0, 100);
                });
            });

            describe("successfully", () => {
                let tx: ContractTransaction;
                let recipt: ContractReceipt;

                beforeEach(async () => {
                    [tx, recipt] = await txExec(
                        contract.connect(owner).setTokenPenalty(0, 100)
                    );
                });

                it("Should emit event", async () => {
                    assertEvent<TokenPenaltyChangedEvent>(
                        recipt,
                        "TokenPenaltyChanged",
                        {
                            tokenId: BigNumber.from(0),
                            penalty: BigNumber.from(100),
                        }
                    );
                });

                it("Should update state", async () => {
                    const token = await contract.tokens(0);
                    expect(token.penalty).to.be.equal(100);
                });
            });
        });
    });
});
