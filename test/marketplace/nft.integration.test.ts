import { ForeProtocol } from "@/ForeProtocol";
import { BasicFactory } from "@/BasicFactory";
import { ForeNftMarketplace } from "@/ForeNftMarketplace";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers, TransferEvent } from "@/ForeVerifiers";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";
import { ContractReceipt } from "@ethersproject/contracts/src.ts/index";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MarketLib } from "@/MarketLib";
import { expect } from "chai";
import { BigNumber, ContractTransaction, Signer } from "ethers";
import { ethers } from "hardhat";
import {
    deployContract,
    deployMockedContract,
    findEvent,
    impersonateContract,
    txExec,
    deployLibrary,
} from "../helpers/utils";

describe("NFTMarketplace / NFT integration", () => {
    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let treasury: SignerWithAddress;
    let creator: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    let foreProtocol: MockContract<ForeProtocol>;
    let basicFactory: MockContract<BasicFactory>;
    let foreProtocolAccount: Signer;
    let basicFactoryAccount: Signer;
    let foreToken: MockContract<ForeToken>;
    let nftToken: MockContract<ForeVerifiers>;
    let contract: ForeNftMarketplace;
    let marketLib: MarketLib;

    let ownerdNfts: Record<string, BigNumber[]>;

    async function createTokens(num: number, recipients: string[]) {
        for (let i = 0; i < num; ++i) {
            const rIdx = i % recipients.length;
            const recipient = recipients[rIdx];

            const [tx, recipt] = await txExec(
                nftToken
                    .connect(foreProtocolAccount)
                    .mintWithPower(recipient, 100, 0, 0)
            );

            const mintEvent = findEvent<TransferEvent>(recipt, "Transfer");
            if (!ownerdNfts[mintEvent.args.to]) {
                ownerdNfts[mintEvent.args.to] = [];
            }

            ownerdNfts[mintEvent.args.to].push(mintEvent.args.tokenId);
        }
    }

    async function transferCoins(num: number, recipients: string[]) {
        for (const recipient of recipients) {
            const [tx, recipt] = await txExec(
                foreToken
                    .connect(owner)
                    .transfer(
                        recipient,
                        ethers.utils.parseUnits(num.toString(), "ether")
                    )
            );
        }
    }

    beforeEach(async () => {
        [owner, admin, treasury, creator, alice, bob] =
            await ethers.getSigners();

        ownerdNfts = {};

        foreToken = await deployMockedContract("ForeToken");
        nftToken = await deployMockedContract("ForeVerifiers");

        contract = await deployContract<ForeNftMarketplace>(
            "ForeNftMarketplace",
            admin.address,
            treasury.address,
            foreToken.address,
            ethers.utils.parseUnits("0.0001", "ether"),
            ethers.utils.parseUnits("1000", "ether")
        );

        const protocolConfig = await deployMockedContract(
            "ProtocolConfig",
            "0x0000000000000000000000000000000000000001",
            "0x0000000000000000000000000000000000000003",
            contract.address,
            foreToken.address,
            nftToken.address,
            ethers.utils.parseEther("2"),
            ethers.utils.parseEther("3")
        );

        marketLib = await deployLibrary("MarketLib", ["BasicFactory"]);

        foreProtocol = await deployMockedContract(
            "ForeProtocol",
            protocolConfig.address
        );
        foreProtocolAccount = await impersonateContract(foreProtocol.address);

        basicFactory = await deployMockedContract(
            "BasicFactory",
            foreProtocol.address
        );
        basicFactoryAccount = await impersonateContract(basicFactory.address);

        await txExec(foreToken.setProtocol(foreProtocol.address));
        await txExec(nftToken.setProtocol(foreProtocol.address));

        await txExec(
            protocolConfig
                .connect(owner)
                .setFactoryStatus([basicFactory.address], [true])
        );

        await txExec(
            contract
                .connect(admin)
                .addCollection(
                    nftToken.address,
                    creator.address,
                    "0x0000000000000000000000000000000000000000",
                    0,
                    2000
                )
        );

        await transferCoins(1e6, [alice.address, bob.address]);
        await createTokens(5, [alice.address, bob.address]);

        // allowance
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

    describe("with tokens for sale", () => {
        beforeEach(async () => {
            await txExec(
                nftToken
                    .connect(alice)
                    .approve(contract.address, ownerdNfts[alice.address][0])
            );

            await txExec(
                contract
                    .connect(alice)
                    .createAskOrder(
                        nftToken.address,
                        ownerdNfts[alice.address][0],
                        ethers.utils.parseUnits("1", "ether")
                    )
            );
        });

        it("Should transfer coins from buyer", async () => {
            await expect(() =>
                contract
                    .connect(bob)
                    .buyTokenUsingWBNB(
                        nftToken.address,
                        ownerdNfts[alice.address][0],
                        ethers.utils.parseUnits("1", "ether")
                    )
            ).to.changeTokenBalance(
                foreToken,
                bob,
                ethers.utils.parseUnits("-1", "ether")
            );
        });

        it("Should transfer coins to seller", async () => {
            await expect(() =>
                contract
                    .connect(bob)
                    .buyTokenUsingWBNB(
                        nftToken.address,
                        ownerdNfts[alice.address][0],
                        ethers.utils.parseUnits("1", "ether")
                    )
            ).to.changeTokenBalance(
                foreToken,
                alice,
                ethers.utils.parseUnits("0.8", "ether")
            );
        });

        describe("Buys successfully", () => {
            let tx: ContractTransaction;
            let recipt: ContractReceipt;

            beforeEach(async () => {
                [tx, recipt] = await txExec(
                    contract
                        .connect(bob)
                        .buyTokenUsingWBNB(
                            nftToken.address,
                            ownerdNfts[alice.address][0],
                            ethers.utils.parseUnits("1", "ether")
                        )
                );
            });

            it("Should emit Trade event", async () => {
                expect(tx)
                    .to.emit(contract, "Trade")
                    .withArgs(
                        nftToken.address,
                        ownerdNfts[alice.address][0],
                        alice.address,
                        bob.address,
                        ethers.utils.parseUnits("1", "ether"),
                        ethers.utils.parseUnits("0.8", "ether"),
                        false
                    );
            });

            it("Should emit Transfer event", async () => {
                expect(tx)
                    .to.emit(nftToken, "Transfer")
                    .withArgs(
                        contract.address,
                        bob.address,
                        ownerdNfts[alice.address][0]
                    );
            });

            it("Should increase pending revenue", async () => {
                expect(
                    await contract.pendingRevenue(creator.address)
                ).to.be.equal(ethers.utils.parseUnits("0.2", "ether"));
            });

            it("Should be able to claim pending revenue", async () => {
                await expect(() =>
                    contract.connect(creator).claimPendingRevenue()
                ).to.changeTokenBalance(
                    foreToken,
                    creator,
                    ethers.utils.parseUnits("0.2", "ether")
                );
            });
        });
    });
});
