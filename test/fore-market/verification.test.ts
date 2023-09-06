import { BasicMarket } from "@/BasicMarket";
import { ForeProtocol, MarketCreatedEvent } from "@/ForeProtocol";
import { BasicFactory } from "@/BasicFactory";
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

describe("BasicMarket / Verification", () => {
    let owner: SignerWithAddress;
    let foundationWallet: SignerWithAddress;
    let highGuardAccount: SignerWithAddress;
    let marketplaceContract: SignerWithAddress;
    let foreProtocolAccount: Signer;
    let basicFactoryAccount: Signer;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let carol: SignerWithAddress;
    let dave: SignerWithAddress;
    let marketLib: MarketLib;

    let protocolConfig: MockContract<ProtocolConfig>;
    let foreToken: MockContract<ForeToken>;
    let foreVerifiers: MockContract<ForeVerifiers>;
    let foreProtocol: MockContract<ForeProtocol>;
    let basicFactory: MockContract<BasicFactory>;
    let contract: BasicMarket;

    let blockTimestamp: number;

    beforeEach(async () => {
        [
            owner,
            foundationWallet,
            highGuardAccount,
            marketplaceContract,
            alice,
            bob,
            carol,
            dave,
        ] = await ethers.getSigners();

        // deploy library
        marketLib = await deployLibrary("MarketLib", [
            "BasicMarket",
            "BasicFactory",
        ]);

        // preparing dependencies
        foreToken = await deployMockedContract<ForeToken>("ForeToken");
        foreVerifiers = await deployMockedContract<ForeVerifiers>(
            "ForeVerifiers",
            "https://test.com/"
        );

        protocolConfig = await deployMockedContract<ProtocolConfig>(
            "ProtocolConfig",
            foundationWallet.address,
            highGuardAccount.address,
            marketplaceContract.address,
            foreToken.address,
            foreVerifiers.address,
            ethers.utils.parseEther("10"),
            ethers.utils.parseEther("20")
        );

        // preparing fore markets (factory)
        foreProtocol = await deployMockedContract<ForeProtocol>(
            "ForeProtocol",
            protocolConfig.address,
            "https://markets.api.foreprotocol.io/market/"
        );
        foreProtocolAccount = await impersonateContract(foreProtocol.address);

        basicFactory = await deployMockedContract<BasicFactory>(
            "BasicFactory",
            foreProtocol.address
        );
        basicFactoryAccount = await impersonateContract(basicFactory.address);

        // factory assignment
        await txExec(foreVerifiers.setProtocol(foreProtocol.address));

        await txExec(
            protocolConfig
                .connect(owner)
                .setFactoryStatus([basicFactory.address], [true])
        );

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
                    43200,
                    43200,
                    100,
                    100,
                    50,
                    150
                )
        );
        await txExec(
            foreToken
                .connect(alice)
                .approve(
                    basicFactory.address,
                    ethers.utils.parseUnits("1000", "ether")
                )
        );

        // creating market
        const marketHash =
            "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab";
        const [tx, recipt] = await txExec(
            basicFactory
                .connect(alice)
                .createMarket(
                    marketHash,
                    alice.address,
                    ethers.utils.parseEther("50"),
                    ethers.utils.parseEther("40"),
                    blockTimestamp + 200000,
                    blockTimestamp + 300000
                )
        );

        const initCode = await basicFactory.INIT_CODE_PAIR_HASH();

        const salt = marketHash;
        const newAddress = ethers.utils.getCreate2Address(
            basicFactory.address,
            salt,
            initCode
        );

        contract = await attachContract<BasicMarket>("BasicMarket", newAddress);

        await executeInSingleBlock(() => [
            foreToken
                .connect(alice)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("1000", "ether")
                ),
            foreToken
                .connect(bob)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("1000", "ether")
                ),
            foreToken
                .connect(carol)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("1000", "ether")
                ),
            foreToken
                .connect(dave)
                .approve(
                    contract.address,
                    ethers.utils.parseUnits("1000", "ether")
                ),
        ]);

        // create verifiers tokens
        await executeInSingleBlock(() => [
            foreToken
                .connect(owner)
                .approve(
                    foreProtocol.address,
                    ethers.utils.parseUnits("1000", "ether")
                ),
            foreProtocol.connect(owner).mintVerifier(alice.address),
            foreProtocol.connect(owner).mintVerifier(bob.address),
            foreProtocol.connect(owner).mintVerifier(carol.address),
            foreProtocol.connect(owner).mintVerifier(dave.address),
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
        //     ).to.revertedWith("BasicMarket: Not enough power");
        // });

        it("Should revert if executed with non owned token", async () => {
            await expect(contract.connect(bob).verify(0, true)).to.revertedWith(
                "BasicMarket: Incorrect owner"
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
                            ethers.constants.AddressZero, // dispute creator
                            BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                            BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                            0, // result
                            false, // confirmed
                            false, // solved
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
                        ethers.constants.AddressZero, // dispute creator
                        BigNumber.from(blockTimestamp + 200000), // endPredictionTimestamp
                        BigNumber.from(blockTimestamp + 300000), // startVerificationTimestamp
                        0, // result
                        false, // confirmed
                        false, // solved
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

    describe("after verification period end", () => {
        beforeEach(async () => {
            await timetravel(blockTimestamp + 300000 + 43200 + 1);
        });

        it("Should revert trying to verify", async () => {
            await expect(contract.connect(bob).verify(1, true)).to.revertedWith(
                "VerificationAlreadyClosed"
            );
        });
    });
});
