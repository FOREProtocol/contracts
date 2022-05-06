import {
    ForeAnalystNFT,
    WhitelistActivityChangedEvent,
    WhitelistAccountChangedEvent,
} from "@/ForeAnalystNFT";
import { ContractReceipt } from "@ethersproject/contracts/src.ts/index";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ContractTransaction } from "ethers";
import { ethers } from "hardhat";
import {
    assertEvent,
    assertIsAvailableOnlyForOwner,
    deployContract,
    txExec,
} from "../../helpers/utils";

describe("ForeAnalystNFT / TransferingWhitelist / Management", () => {
    let owner: SignerWithAddress;
    let alice: SignerWithAddress;

    let contract: ForeAnalystNFT;

    beforeEach(async () => {
        contract = await deployContract<ForeAnalystNFT>("ForeAnalystNFT");
        [owner, alice] = await ethers.getSigners();
    });

    describe("Intial state", () => {
        it("Should be disabled", async () => {
            expect(await contract.getWhitelistFeatureActive()).to.be.equal(
                false
            );
        });

        it("Alice should be not whitelisted", async () => {
            expect(
                await contract.getAccountWhitelisted(alice.address)
            ).to.be.equal(false);
        });
    });

    describe("Activating whitelist", () => {
        it("Should allow to execute only by owner", async () => {
            await assertIsAvailableOnlyForOwner(async (account) => {
                return contract
                    .connect(account)
                    .setWhitelistFeatureActive(true);
            });
        });

        describe("successfully", () => {
            let tx: ContractTransaction;
            let recipt: ContractReceipt;

            beforeEach(async () => {
                [tx, recipt] = await txExec(
                    contract.connect(owner).setWhitelistFeatureActive(true)
                );
            });

            it("Should emit event", async () => {
                assertEvent<WhitelistActivityChangedEvent>(
                    recipt,
                    "WhitelistActivityChanged",
                    {
                        active: true,
                    }
                );
            });

            it("Should update state", async () => {
                expect(await contract.getWhitelistFeatureActive()).to.be.equal(
                    true
                );
            });
        });
    });

    describe("Adding to whitelist", () => {
        it("Should allow to execute only by owner", async () => {
            await assertIsAvailableOnlyForOwner(async (account) => {
                return contract
                    .connect(account)
                    .setAccountWhitelisted(alice.address, true);
            });
        });

        describe("successfully", () => {
            let tx: ContractTransaction;
            let recipt: ContractReceipt;

            beforeEach(async () => {
                [tx, recipt] = await txExec(
                    contract
                        .connect(owner)
                        .setAccountWhitelisted(alice.address, true)
                );
            });

            it("Should emit event", async () => {
                assertEvent<WhitelistAccountChangedEvent>(
                    recipt,
                    "WhitelistAccountChanged",
                    {
                        account: alice.address,
                        active: true,
                    }
                );
            });

            it("Should update state", async () => {
                expect(
                    await contract.getAccountWhitelisted(alice.address)
                ).to.be.equal(true);
            });
        });
    });
});
