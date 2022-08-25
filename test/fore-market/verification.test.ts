import { ForeMarket } from "@/ForeMarket";
import { ForeMarkets, MarketCreatedEvent } from "@/ForeMarkets";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers } from "@/ForeVerifiers";
import { ProtocolConfig } from "@/ProtocolConfig";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";
import { ContractReceipt } from "@ethersproject/contracts/src.ts/index";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { MarketLib } from "@/MarketLib";
import { BigNumber, ContractTransaction, Signer } from "ethers";
import { ethers } from "hardhat";
import { deployLibrary, executeInSingleBlock } from "../../test/helpers/utils";
import {
    attachContract,
    deployMockedContract,
    findEvent,
    impersonateContract,
    sendERC20Tokens,
    timetravel,
    txExec,
    waitForTxs,
} from "../helpers/utils";

const sides = {
    A: true,
    B: false,
};

describe("ForeMarket / Verification", () => {
    let owner: SignerWithAddress;
    let foundationWallet: SignerWithAddress;
    let revenueWallet: SignerWithAddress;
    let highGuardAccount: SignerWithAddress;
    let marketplaceContract: SignerWithAddress;
    let foreMarketsAccount: Signer;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let carol: SignerWithAddress;
    let dave: SignerWithAddress;
    let marketLib: MarketLib;

    let protocolConfig: MockContract<ProtocolConfig>;
    let foreToken: MockContract<ForeToken>;
    let foreVerifiers: MockContract<ForeVerifiers>;
    let foreMarkets: MockContract<ForeMarkets>;
    let contract: ForeMarket;

    let blockTimestamp: number;

    beforeEach(async () => {
        [
            owner,
            foundationWallet,
            revenueWallet,
            highGuardAccount,
            marketplaceContract,
            alice,
            bob,
            carol,
            dave,
        ] = await ethers.getSigners();

        // deploy library
        marketLib = await deployLibrary("MarketLib", [
            "ForeMarket",
            "ForeMarkets",
        ]);

        // preparing dependencies
        foreToken = await deployMockedContract<ForeToken>("ForeToken");
        foreVerifiers = await deployMockedContract<ForeVerifiers>(
            "ForeVerifiers"
        );

        protocolConfig = await deployMockedContract<ProtocolConfig>(
            "ProtocolConfig",
            foundationWallet.address,
            revenueWallet.address,
            highGuardAccount.address,
            marketplaceContract.address,
            foreToken.address,
            foreVerifiers.address,
            ethers.utils.parseEther("10"),
            ethers.utils.parseEther("20")
        );

        // preparing fore markets (factory)
        foreMarkets = await deployMockedContract<ForeMarkets>(
            "ForeMarkets",
            protocolConfig.address
        );
        foreMarketsAccount = await impersonateContract(foreMarkets.address);

        // factory assignment
        await txExec(foreToken.setFactory(foreMarkets.address));
        await txExec(foreVerifiers.setFactory(foreMarkets.address));

        // sending funds
        await sendERC20Tokens(foreToken, {
            [alice.address]: ethers.utils.parseEther("1000"),
            [bob.address]: ethers.utils.parseEther("1000"),
            [carol.address]: ethers.utils.parseEther("1000"),
            [dave.address]: ethers.utils.parseEther("1000"),
        });

        const previousBlock = await ethers.provider.getBlock("latest");
        blockTimestamp = previousBlock.timestamp;

        await txExec(
            protocolConfig
                .connect(owner)
                .setMarketConfig(
                    ethers.utils.parseEther("1000"),
                    ethers.utils.parseEther("1000"),
                    ethers.utils.parseEther("1000"),
                    1800,
                    1800,
                    100,
                    100,
                    100,
                    50,
                    150,
                    true
                )
        );

        // creating market
        const [tx, recipt] = await txExec(
            foreMarkets
                .connect(alice)
                .createMarket(
                    "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                    alice.address,
                    ethers.utils.parseEther("50"),
                    ethers.utils.parseEther("40"),
                    blockTimestamp + 200000,
                    blockTimestamp + 300000
                )
        );

        // attach to market
        const marketCreatedEvent = findEvent<MarketCreatedEvent>(
            recipt,
            "MarketCreated"
        );
        const marketAddress = marketCreatedEvent.args.market;

        contract = await attachContract<ForeMarket>(
            "ForeMarket",
            marketAddress
        );

        // create verifiers tokens
        await executeInSingleBlock(() => [
            foreMarkets.connect(owner).mintVerifier(alice.address),
            foreMarkets.connect(owner).mintVerifier(bob.address),
            foreMarkets.connect(owner).mintVerifier(carol.address),
            foreMarkets.connect(owner).mintVerifier(dave.address),
        ]);
    });

    describe("initial state", () => {
        it("Should return proper verifications number", async () => {
            expect(await contract.verificationHeight()).to.be.equal(0);
        });

        it("Should revert if executed before predicition end", async () => {
            await timetravel(blockTimestamp + 250000);

            await expect(contract.connect(bob).verify(1, true)).to.revertedWith(
                "VerificationHasNotStartedYet"
            );
        });
    });

    describe("after verification period start", () => {
        beforeEach(async () => {
            await timetravel(blockTimestamp + 300001);
        });

        // todo ld 2022-06-01 07:45:44
        // it("Should revert if executed with non powerful token", async () => {
        //     await txExec(
        //         protocolConfig
        //             .connect(owner)
        //             .setVerifierMintPrice(ethers.utils.parseEther("50"))
        //     );
        //
        //     await expect(
        //         contract.connect(alice).stakeForPrivilege(0)
        //     ).to.revertedWith("ForeMarket: Not enough power");
        // });

        it("Should revert if executed with non owned token", async () => {
            await expect(contract.connect(bob).verify(0, true)).to.revertedWith(
                "ForeMarket: Incorrect owner"
            );
        });

        for (const [sideName, sideValue] of Object.entries(sides)) {
            describe(`verifing ${sideName} side`, () => {
                describe(`sucessfully`, () => {
                    let tx: ContractTransaction;
                    let recipt: ContractReceipt;

                    beforeEach(async () => {
                        [tx, recipt] = await txExec(
                            contract.connect(bob).verify(1, sideValue)
                        );
                    });

                    it("Should emit Transfer (ERC721) event", async () => {
                        await expect(tx)
                            .to.emit(foreVerifiers, "Transfer")
                            .withArgs(
                                bob.address,
                                contract.address,
                                BigNumber.from(1)
                            );
                    });

                    it("Should emit Verify event", async () => {
                        await expect(tx)
                            .to.emit(
                                { ...marketLib, address: contract.address },
                                "Verify"
                            )
                            .withArgs(
                                bob.address,
                                ethers.utils.parseEther("20"),
                                BigNumber.from(0),
                                BigNumber.from(1),
                                sideValue
                            );
                    });

                    it("Should update state size of verifications", async () => {
                        expect(await contract.verificationHeight()).to.be.equal(
                            1
                        );
                    });

                    it("Should return proper verfication state", async () => {
                        expect(await contract.verifications(0)).to.be.eql([
                            bob.address,
                            ethers.utils.parseEther("20"),
                            BigNumber.from(1),
                            sideValue,
                            false,
                        ]);
                    });

                    it("Should update market verification powers", async () => {
                        expect(await contract.marketInfo()).to.be.eql([
                            ethers.utils.parseEther("50"), // side A
                            ethers.utils.parseEther("40"), // side B
                            ethers.utils.parseEther(sideValue ? "20" : "0"), // verified A
                            ethers.utils.parseEther(sideValue ? "0" : "20"), // verified B
                            ethers.utils.parseEther("0"), // reserved
                            ethers.constants.AddressZero, // privilege nft staker
                            ethers.constants.AddressZero, // dispute creator
                            BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                            BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                            BigNumber.from(0), // privilege nft id
                            0, // result
                            false, // confirmed
                            false, // solved
                            false, // extended
                        ]);
                    });
                });
            });
        }

        describe("multiple verifications", () => {
            beforeEach(async () => {
                await executeInSingleBlock(() => [
                    contract.connect(alice).verify(0, false),
                    contract.connect(bob).verify(1, false),
                ]);
            });

            describe("adding verification to almost fully verified market", () => {
                let tx: ContractTransaction;
                let recipt: ContractReceipt;

                beforeEach(async () => {
                    [tx, recipt] = await txExec(
                        contract.connect(carol).verify(2, false)
                    );
                });

                it("Should increase verfication side with partial token power", async () => {
                    expect(await contract.marketInfo()).to.be.eql([
                        ethers.utils.parseEther("50"), // side A
                        ethers.utils.parseEther("40"), // side B
                        ethers.utils.parseEther("0"), // verified A
                        ethers.utils.parseEther("50"), // verified B
                        ethers.utils.parseEther("0"), // reserved
                        ethers.constants.AddressZero, // privilege nft staker
                        ethers.constants.AddressZero, // dispute creator
                        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                        BigNumber.from(0), // privilege nft id
                        0, // result
                        false, // confirmed
                        false, // solved
                        false, // extended
                    ]);
                });

                it("Should return proper power in verification entry", async () => {
                    expect(await contract.verifications(2)).to.be.eql([
                        carol.address,
                        ethers.utils.parseEther("10"),
                        BigNumber.from(2),
                        false,
                        false,
                    ]);
                });

                it("Should not allow to verifiy fully verified market", async () => {
                    await expect(
                        contract.connect(dave).verify(3, false)
                    ).to.be.revertedWith("MarketIsFullyVerified");
                });
            });
        });
    });

    describe("with privilege NFT used", () => {
        beforeEach(async () => {
            await txExec(contract.connect(alice).stakeForPrivilege(0));
        });

        describe("after verification period start", () => {
            beforeEach(async () => {
                await timetravel(blockTimestamp + 300001);
            });

            for (const [sideName, sideValue] of Object.entries(sides)) {
                describe(`verifing ${sideName} side`, () => {
                    it("Should update market verification powers", async () => {
                        expect(await contract.marketInfo()).to.be.eql([
                            ethers.utils.parseEther("50"), // side A
                            ethers.utils.parseEther("40"), // side B
                            ethers.utils.parseEther("0"), // verified A
                            ethers.utils.parseEther("0"), // verified B
                            ethers.utils.parseEther("20"), // reserved
                            alice.address, // privilege nft staker
                            ethers.constants.AddressZero, // dispute creator
                            BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                            BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                            BigNumber.from(0), // privilege nft id
                            0, // result
                            false, // confirmed
                            false, // solved
                            false, // extended
                        ]);
                    });

                    describe("successfully verifing with privilege NFT", () => {
                        let tx: ContractTransaction;
                        let recipt: ContractReceipt;

                        beforeEach(async () => {
                            [tx, recipt] = await txExec(
                                contract
                                    .connect(alice)
                                    .privilegeVerify(sideValue)
                            );
                        });

                        it("Should reduce opposite side of verification", async () => {
                            expect(await contract.marketInfo()).to.be.eql([
                                ethers.utils.parseEther("50"), // side A
                                ethers.utils.parseEther("40"), // side B
                                ethers.utils.parseEther(sideValue ? "20" : "0"), // verified A
                                ethers.utils.parseEther(sideValue ? "0" : "20"), // verified B
                                ethers.utils.parseEther("0"), // reserved
                                ethers.constants.AddressZero, // privilege nft staker
                                ethers.constants.AddressZero, // dispute creator
                                BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                                BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                                BigNumber.from(0), // privilege nft id
                                0, // result
                                false, // confirmed
                                false, // solved
                                false, // extended
                            ]);
                        });

                        it("Should not be able to stake twice", async () => {
                            await expect(
                                contract
                                    .connect(alice)
                                    .privilegeVerify(sideValue)
                            ).to.be.revertedWith("IncorrectOwner");
                        });
                    });
                });
            }
        });
    });

    describe("after verification period end", () => {
        beforeEach(async () => {
            await timetravel(blockTimestamp + 300000 + 1800 + 1);
        });

        it("Should revert trying to verify", async () => {
            await expect(contract.connect(bob).verify(1, true)).to.revertedWith(
                "VerificationAlreadyClosed"
            );
        });
    });
});
