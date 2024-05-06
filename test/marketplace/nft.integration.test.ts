import { ForeProtocol } from "@/ForeProtocol";
import { BasicFactory } from "@/BasicFactory";
import { ForeNftMarketplace } from "@/ForeNftMarketplace";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers, TransferEvent } from "@/ForeVerifiers";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract, ContractTransaction, Signer } from "ethers";
import { ethers, upgrades } from "hardhat";
import {
    deployContract,
    deployMockedContract,
    findEvent,
    impersonateContract,
    txExec,
    deployLibrary,
} from "../helpers/utils";
import { ERC20 } from "@/ERC20";

describe("NFTMarketplace / NFT integration", () => {
    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let treasury: SignerWithAddress;
    let creator: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    let foreProtocol: MockContract<ForeProtocol>;
    let tokenRegistry: Contract;
    let usdcToken: MockContract<ERC20>;
    let basicFactory: MockContract<BasicFactory>;
    let foreProtocolAccount: Signer;
    let foreToken: MockContract<ForeToken>;
    let nftToken: MockContract<ForeVerifiers>;
    let contract: ForeNftMarketplace;

    let ownerNfts: Record<string, BigNumber[]>;

    async function createTokens(num: number, recipients: string[]) {
        for (let i = 0; i < num; ++i) {
            const rIdx = i % recipients.length;
            const recipient = recipients[rIdx];

            const [, receipt] = await txExec(
                nftToken
                    .connect(foreProtocolAccount)
                    .mintWithPower(recipient, 100, 0, 0)
            );

            const mintEvent = findEvent<TransferEvent>(receipt, "Transfer");
            if (!ownerNfts[mintEvent.args.to]) {
                ownerNfts[mintEvent.args.to] = [];
            }

            ownerNfts[mintEvent.args.to].push(mintEvent.args.tokenId);
        }
    }

    async function transferCoins(num: number, recipients: string[]) {
        for (const recipient of recipients) {
            await txExec(
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

        ownerNfts = {};

        foreToken = await deployMockedContract("ForeToken");
        nftToken = await deployMockedContract(
            "ForeVerifiers",
            "https://test.com"
        );

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

        await deployLibrary("MarketLib", ["BasicFactory"]);

        foreProtocol = await deployMockedContract(
            "ForeProtocol",
            protocolConfig.address,
            "https://test.com/"
        );
        foreProtocolAccount = await impersonateContract(foreProtocol.address);

        usdcToken = await deployMockedContract<ERC20>(
            "MockERC20",
            "USDC",
            "USD Coin",
            ethers.utils.parseEther("1000000")
        );

        // preparing token registry
        const contractFactory = await ethers.getContractFactory(
            "TokenIncentiveRegistry"
        );
        const tokens = [
            {
                tokenAddress: usdcToken.address,
                discountRate: 10,
            },
        ];
        tokenRegistry = await upgrades.deployProxy(contractFactory, [tokens]);

        basicFactory = await deployMockedContract(
            "BasicFactory",
            foreProtocol.address,
            tokenRegistry.address
        );

        await txExec(nftToken.setProtocol(foreProtocol.address));

        await txExec(
            protocolConfig
                .connect(owner)
                .setFactoryStatus([basicFactory.address], [true])
        );

        await txExec(nftToken.setTransferAllowance(true));

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
                    .approve(contract.address, ownerNfts[alice.address][0])
            );

            await txExec(
                contract
                    .connect(alice)
                    .createAskOrder(
                        nftToken.address,
                        ownerNfts[alice.address][0],
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
                        ownerNfts[alice.address][0],
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
                        ownerNfts[alice.address][0],
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

            beforeEach(async () => {
                [tx] = await txExec(
                    contract
                        .connect(bob)
                        .buyTokenUsingWBNB(
                            nftToken.address,
                            ownerNfts[alice.address][0],
                            ethers.utils.parseUnits("1", "ether")
                        )
                );
            });

            it("Should emit Trade event", async () => {
                expect(tx)
                    .to.emit(contract, "Trade")
                    .withArgs(
                        nftToken.address,
                        ownerNfts[alice.address][0],
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
                        ownerNfts[alice.address][0]
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

    describe("Not implemented function", () => {
        it("Should revert with not implemented error", async () => {
            await expect(
                contract
                    .connect(bob)
                    .buyTokenUsingBNB(
                        "0x0000000000000000000000000000000000000000",
                        1
                    )
            ).to.revertedWith("ForeNftMarketplace: Function not implemented");
        });
    });
});
