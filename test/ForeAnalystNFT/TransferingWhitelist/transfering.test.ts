import { ForeAnalystNFT, TransferEvent } from "@/ForeAnalystNFT";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, ContractTransaction } from "ethers";
import { ethers } from "hardhat";
import {
    deployContract,
    executeInSingleBlock,
    findEvent,
    txExec,
} from "../../helpers/utils";

describe("ForeAnalystNFT / TransferingWhitelist / Transfering", () => {
    let owner: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    let contract: ForeAnalystNFT;

    let ownerdNfts: Record<string, BigNumber[]>;

    async function createTokens(num: number, recipients: string[]) {
        for (let i = 0; i < num; ++i) {
            const rIdx = i % recipients.length;
            const recipient = recipients[rIdx];

            const [tx, recipt] = await txExec(
                contract.connect(owner).mint(recipient, {
                    staked: 1,
                    penalty: 1,
                })
            );

            const mintEvent = findEvent<TransferEvent>(recipt, "Transfer");
            if (!ownerdNfts[mintEvent.args.to]) {
                ownerdNfts[mintEvent.args.to] = [];
            }

            ownerdNfts[mintEvent.args.to].push(mintEvent.args.tokenId);
        }
    }

    before(async () => {
        [owner, alice, bob] = await ethers.getSigners();
        ownerdNfts = {};
    });

    beforeEach(async () => {
        contract = await deployContract<ForeAnalystNFT>("ForeAnalystNFT");

        // create tokens
        await createTokens(15, [owner.address, alice.address, bob.address]);
    });

    describe("With whitelisting configured", () => {
        beforeEach(async () => {
            await txExec(
                contract.connect(owner).setWhitelistFeatureActive(true)
            );
            await txExec(
                contract
                    .connect(owner)
                    .setAccountWhitelisted(alice.address, true)
            );
        });

        it("Should not be allowed to transfer without whitelisted account", async () => {
            await expect(
                contract
                    .connect(owner)
                    .transferFrom(
                        owner.address,
                        bob.address,
                        ownerdNfts[owner.address][0]
                    )
            ).to.be.revertedWith("TransferNotAllowed()");
        });

        it("Should be allowed to transfer to whitelisted account", async () => {
            await txExec(
                contract
                    .connect(owner)
                    .transferFrom(
                        owner.address,
                        alice.address,
                        ownerdNfts[owner.address][0]
                    )
            );
        });

        it("Should be allowed to transfer from whitelisted account", async () => {
            await txExec(
                contract
                    .connect(alice)
                    .transferFrom(
                        alice.address,
                        owner.address,
                        ownerdNfts[alice.address][0]
                    )
            );
        });
    });
});
