import { BigNumber, Contract } from "ethers";
import { ethers, network } from "hardhat";
import { expect } from "chai";

import { BasicMarket } from "@/BasicMarket";
import { ForeToken } from "@/ForeToken";
import { ForeProtocol } from "@/ForeProtocol";
import { BasicFactory } from "@/BasicFactory";
import { ApprovalManagerRouter } from "@/ApprovalManagerRouter";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MaxAllowanceTransferAmount, PERMIT_TYPES } from "../helpers/constants";
import {
    attachContract,
    deployContract,
    deployLibrary,
    deployMockedContract,
    generateRandomHexString,
    getPreviousBlock,
    toDeadline,
    txExec,
} from "../helpers/utils";

// Make sure to run `forge build` on permit2 submodule
import Permit2Artifact from "../../lib/permit2/out/Permit2.sol/Permit2.json";

interface PermitSingle {
    details: {
        token: string;
        amount: BigNumber;
        expiration: number;
        nonce: number;
    };
    spender: string;
    sigDeadline: number;
}

describe("Intermediaries / Approval Manager", () => {
    let [
        owner,
        foundationWallet,
        highGuardAccount,
        marketplaceContract,
        marketCreator,
        player,
    ]: SignerWithAddress[] = [];

    let foreToken: ForeToken;
    let foreProtocol: MockContract<ForeProtocol>;
    let basicFactory: MockContract<BasicFactory>;
    let router: ApprovalManagerRouter;
    let permit2: Contract;

    const markets: (BasicMarket | null)[] = new Array(5).fill(null);

    before(async () => {
        await network.provider.send("hardhat_reset");
    });

    beforeEach(async () => {
        [
            owner,
            foundationWallet,
            highGuardAccount,
            marketplaceContract,
            marketCreator,
            player,
        ] = await ethers.getSigners();

        // Deploy Permit2
        const permitFactory = new ethers.ContractFactory(
            Permit2Artifact.abi,
            Permit2Artifact.bytecode,
            owner
        );
        permit2 = await permitFactory.deploy();

        // Deploy library
        await deployLibrary("MarketLib", ["BasicMarket", "BasicFactory"]);

        // Deploy dependencies
        foreToken = await deployContract<ForeToken>("ForeToken");
        const foreVerifiers = await deployMockedContract(
            "ForeVerifiers",
            "https://test.com/"
        );
        const protocolConfig = await deployMockedContract(
            "ProtocolConfig",
            foundationWallet.address,
            highGuardAccount.address,
            marketplaceContract.address,
            foreToken.address,
            foreVerifiers.address,
            ethers.utils.parseEther("10"),
            ethers.utils.parseEther("20")
        );
        foreProtocol = await deployMockedContract<ForeProtocol>(
            "ForeProtocol",
            protocolConfig.address,
            "https://markets.api.foreprotocol.io/market/"
        );

        // Deploy Factory
        basicFactory = await deployMockedContract<BasicFactory>(
            "BasicFactory",
            foreProtocol.address
        );

        // Deploy router
        router = await deployContract<ApprovalManagerRouter>(
            "ApprovalManagerRouter",
            foreProtocol.address,
            permit2.address
        );

        await txExec(
            protocolConfig
                .connect(owner)
                .setFactoryStatus([basicFactory.address], [true])
        );
        await txExec(
            protocolConfig
                .connect(owner)
                .setFactoryStatus([router.address], [true])
        );

        const blockTimestamp = (await getPreviousBlock()).timestamp;

        // Sending funds
        await txExec(
            foreToken
                .connect(owner)
                .transfer(
                    marketCreator.address,
                    ethers.utils.parseEther("1000")
                )
        );
        await txExec(
            foreToken
                .connect(owner)
                .transfer(player.address, ethers.utils.parseEther("1000"))
        );

        // Approve tokens
        await txExec(
            foreToken
                .connect(marketCreator)
                .approve(
                    basicFactory.address,
                    ethers.utils.parseUnits("1000", "ether")
                )
        );

        // Create markets
        for (let i = 0; i < 5; i++) {
            const hash = generateRandomHexString(64);

            await txExec(
                basicFactory
                    .connect(marketCreator)
                    .createMarket(
                        hash,
                        marketCreator.address,
                        0,
                        0,
                        BigNumber.from(blockTimestamp + 200000),
                        BigNumber.from(blockTimestamp + 300000)
                    )
            );
            const initCode = await basicFactory.INIT_CODE_PAIR_HASH();
            const newAddress = ethers.utils.getCreate2Address(
                basicFactory.address,
                hash,
                initCode
            );
            markets[i] = await attachContract<BasicMarket>(
                "BasicMarket",
                newAddress
            );
        }
    });

    describe("Initial state", () => {
        it("Should return proper router states", async () => {
            expect(await router.foreProtocol()).to.be.eq(foreProtocol.address);
            expect(await router.foreToken()).to.be.eq(foreToken.address);
            expect(await router.permit2()).to.be.eq(permit2.address);
        });
    });

    describe("Basic Market - predict", () => {
        let permitSingle: PermitSingle;
        let signature: string;

        beforeEach(async () => {
            permitSingle = {
                details: {
                    token: foreToken.address,
                    amount: MaxAllowanceTransferAmount,
                    expiration: toDeadline(1000 * 60 * 60 * 24 * 30), // 30 days
                    nonce: 0,
                },
                spender: router.address,
                sigDeadline: toDeadline(1000 * 60 * 60 * 30), // 30 minutes
            };

            const domain = {
                name: "Permit2",
                chainId: 31337,
                verifyingContract: permit2.address,
            };

            signature = await player._signTypedData(
                domain,
                PERMIT_TYPES,
                permitSingle
            );
        });

        describe("Successfully", () => {
            beforeEach(async () => {
                // Approve permit2 contract (one time approval)
                await txExec(
                    foreToken
                        .connect(player)
                        .approve(
                            permit2.address,
                            ethers.utils.parseEther("1000")
                        )
                );
            });

            it("Should predict market", async () => {
                await txExec(
                    router
                        .connect(player)
                        .permitPredict(
                            permitSingle,
                            signature,
                            markets[0].address,
                            ethers.utils.parseEther("2"),
                            true
                        )
                );
                expect((await markets[0].marketInfo()).sideA).to.be.eq(
                    ethers.utils.parseEther("2")
                );
            });

            it("Should predict multiple markets", async () => {
                await txExec(
                    router
                        .connect(player)
                        .permitPredict(
                            permitSingle,
                            signature,
                            markets[0].address,
                            ethers.utils.parseEther("1"),
                            true
                        )
                );
                await txExec(
                    router
                        .connect(player)
                        .predict(
                            markets[1].address,
                            ethers.utils.parseEther("2"),
                            true
                        )
                );
                await txExec(
                    router
                        .connect(player)
                        .predict(
                            markets[2].address,
                            ethers.utils.parseEther("3"),
                            true
                        )
                );

                expect((await markets[0].marketInfo()).sideA).to.be.eq(
                    ethers.utils.parseEther("1")
                );
                expect((await markets[1].marketInfo()).sideA).to.be.eq(
                    ethers.utils.parseEther("2")
                );
                expect((await markets[2].marketInfo()).sideA).to.be.eq(
                    ethers.utils.parseEther("3")
                );
            });
        });

        describe("Permit2 not approved", () => {
            it("Should revert TRANSFER_FROM_FAILED", async () => {
                expect(
                    txExec(
                        router
                            .connect(player)
                            .permitPredict(
                                permitSingle,
                                signature,
                                markets[0].address,
                                ethers.utils.parseEther("2"),
                                true
                            )
                    )
                ).to.be.revertedWith("TRANSFER_FROM_FAILED");
            });
        });
    });
});
