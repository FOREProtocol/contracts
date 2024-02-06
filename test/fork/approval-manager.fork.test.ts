import { ethers, expect } from "hardhat";
import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ForeToken } from "@/ForeToken";
import { ApprovalManagerRouter } from "@/ApprovalManagerRouter";
import { ForeProtocol } from "@/ForeProtocol";
import { MarketLib } from "@/MarketLib";
import { BasicMarket } from "@/BasicMarket";
import { ProtocolConfig } from "@/ProtocolConfig";

import {
    deployContract,
    impersonateContract,
    toDeadline,
    txExec,
} from "../helpers/utils";
import {
    MaxAllowanceTransferAmount,
    PERMIT_TYPES,
    foreProtocolAddress,
    foreTokenAddress,
    permit2Address,
    protocolConfigAddress,
    protocolConfigOwnerAddress,
    tokenHolderAddress,
} from "../helpers/constants";

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

const marketsAddresses = [
    "0x825B1599d5839707Df1c84203F69D16F9130FB67",
    "0x0E67C264bADa2Cd265543bf77ea404b9D0e6ca4A",
    "0x22D3301ee79bCa56336926792C0000bb538ED7fE",
];

describe("Fork / Intermediaries / Approval Manager", () => {
    let [, player]: SignerWithAddress[] = [];

    let foreToken: ForeToken;
    let foreProtocol: ForeProtocol;
    let router: ApprovalManagerRouter;
    let protocolConfig: ProtocolConfig;

    const markets: (BasicMarket | null)[] = new Array(3).fill(null);

    before(async () => {
        await ethers.provider.send("hardhat_reset", [
            {
                forking: {
                    jsonRpcUrl: process.env.ARBITRUM_MAINNET_URL,
                    ...(process.env?.FORK_BLOCK_NUMBER && {
                        blockNumber: Number(process.env.FORK_BLOCK_NUMBER),
                    }),
                },
            },
        ]);
    });

    beforeEach(async () => {
        [, player] = await ethers.getSigners();

        foreProtocol = (await ethers.getContractFactory("ForeProtocol")).attach(
            foreProtocolAddress
        );

        router = await deployContract<ApprovalManagerRouter>(
            "ApprovalManagerRouter",
            foreProtocolAddress,
            permit2Address
        );

        foreToken = (await ethers.getContractFactory("ForeToken")).attach(
            foreTokenAddress
        );

        // Impersonate token holder
        const impersonatedTokenHolder = await impersonateContract(
            tokenHolderAddress
        );

        // Impersonate protocol config owner
        const impersonatedProtocolConfigOwner = await impersonateContract(
            protocolConfigOwnerAddress
        );

        // Attach protocol config
        protocolConfig = (
            await ethers.getContractFactory("ProtocolConfig")
        ).attach(protocolConfigAddress);

        // Set router as operator
        await txExec(
            protocolConfig
                .connect(impersonatedProtocolConfigOwner)
                .setFactoryStatus([router.address], [true])
        );

        // Attach mainnet markets
        const marketLib = await deployContract<MarketLib>("MarketLib");

        for (const [i, address] of marketsAddresses.entries()) {
            markets[i] = (
                await ethers.getContractFactory("BasicMarket", {
                    libraries: {
                        MarketLib: marketLib.address,
                    },
                })
            ).attach(address);
        }

        // Send fore token to player
        await foreToken
            .connect(impersonatedTokenHolder)
            .transfer(player.address, ethers.utils.parseEther("1000"));
    });

    describe("Initial state", () => {
        it("Should return proper router states", async () => {
            expect(await router.foreProtocol()).to.be.eq(foreProtocolAddress);
            expect(await router.foreToken()).to.be.eq(foreTokenAddress);
            expect(await router.permit2()).to.be.eq(permit2Address);
        });

        it("Should return proper state of fore protocol", async () => {
            expect(await foreProtocol.name()).to.be.eq("Fore Markets");
        });

        it("Should return proper state of fore token", async () => {
            expect(await foreToken.name()).to.be.eq("FORE Protocol");
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
                verifyingContract: permit2Address,
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
                            permit2Address,
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
            });
        });
    });
});
