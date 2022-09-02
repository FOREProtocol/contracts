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
import { BigNumber, ContractTransaction, Signer } from "ethers";
import { ethers } from "hardhat";
import {
    attachContract,
    deployLibrary,
    deployMockedContract,
    findEvent,
    impersonateContract,
    timetravel,
    txExec,
} from "../helpers/utils";

describe("BasicMarket / Staking privilege NFT", () => {
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
        await deployLibrary("MarketLib", ["BasicMarket", "BasicFactory"]);

        // preparing dependencies
        foreToken = await deployMockedContract<ForeToken>("ForeToken");
        foreVerifiers = await deployMockedContract<ForeVerifiers>(
            "ForeVerifiers"
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
            protocolConfig.address
        );
        foreProtocolAccount = await impersonateContract(foreProtocol.address);

        basicFactory = await deployMockedContract<BasicFactory>(
            "BasicFactory",
            foreProtocol.address
        );
        basicFactoryAccount = await impersonateContract(basicFactory.address);

        // factory assignment
        await txExec(foreToken.setProtocol(foreProtocol.address));
        await txExec(foreVerifiers.setProtocol(foreProtocol.address));

        await txExec(
            protocolConfig
                .connect(owner)
                .setFactoryStatus([basicFactory.address], [true])
        );

        // sending funds to Alice
        await txExec(
            foreToken
                .connect(owner)
                .transfer(alice.address, ethers.utils.parseEther("1000"))
        );

        const previousBlock = await ethers.provider.getBlock("latest");
        blockTimestamp = previousBlock.timestamp;

        // creating market
        const marketHash =
            "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abaa";
        const [tx, recipt] = await txExec(
            basicFactory
                .connect(alice)
                .createMarket(
                    marketHash,
                    alice.address,
                    ethers.utils.parseEther("50"),
                    ethers.utils.parseEther("40"),
                    BigNumber.from(blockTimestamp + 200000),
                    BigNumber.from(blockTimestamp + 300000)
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

        // create verifiers tokens
        await txExec(foreProtocol.connect(owner).mintVerifier(alice.address));
        await txExec(foreProtocol.connect(owner).mintVerifier(bob.address));
    });

    describe("With enabled PV", () => {
        let tx: ContractTransaction;
        let recipt: ContractReceipt;

        beforeEach(async () => {
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
                        50,
                        150,
                        true
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
                        BigNumber.from(blockTimestamp + 200000),
                        BigNumber.from(blockTimestamp + 300000)
                    )
            );

            const initCode = await basicFactory.INIT_CODE_PAIR_HASH();

            const salt = marketHash;
            const newAddress = ethers.utils.getCreate2Address(
                basicFactory.address,
                salt,
                initCode
            );

            contract = await attachContract<BasicMarket>(
                "BasicMarket",
                newAddress
            );
        });

        it("Should revert if executed with non powerful token", async () => {
            await txExec(
                protocolConfig
                    .connect(owner)
                    .setVerifierMintPrice(ethers.utils.parseEther("50"))
            );

            await expect(
                contract.connect(alice).stakeForPrivilege(0)
            ).to.revertedWith("PowerMustBeGreaterThanMintPrice");
        });

        it("Should revert if executed with non owned token", async () => {
            await expect(
                contract.connect(alice).stakeForPrivilege(1)
            ).to.revertedWith("ERC721: transfer from incorrect owner");
        });

        describe("sucessfully", () => {
            let tx: ContractTransaction;
            let recipt: ContractReceipt;

            beforeEach(async () => {
                [tx, recipt] = await txExec(
                    contract.connect(alice).stakeForPrivilege(0)
                );
            });

            it("Should emit Transfer (ERC721) event", async () => {
                await expect(tx)
                    .to.emit(foreVerifiers, "Transfer")
                    .withArgs(
                        alice.address,
                        contract.address,
                        BigNumber.from(0)
                    );
            });

            it("Should update state of privilegeNft", async () => {
                expect(await contract.marketInfo()).to.be.eql([
                    ethers.utils.parseEther("50"), // side A
                    ethers.utils.parseEther("40"), // side B
                    BigNumber.from(0), // verified A
                    BigNumber.from(0), // verified B
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

            it("Should not be possible to stake for privilege again", async () => {
                await txExec(
                    foreProtocol.connect(owner).mintVerifier(alice.address)
                );
                await expect(
                    contract.connect(alice).stakeForPrivilege(2)
                ).to.be.revertedWith("PrivilegeNftAlreadyExist");

                await expect(
                    contract.connect(bob).stakeForPrivilege(1)
                ).to.be.revertedWith("PrivilegeNftAlreadyExist");
            });
        });

        describe("after verification stage started", () => {
            beforeEach(async () => {
                await timetravel(blockTimestamp + 300000);
            });

            it("Should revert if executed after verification start", async () => {
                await expect(
                    contract.connect(alice).stakeForPrivilege(0)
                ).to.revertedWith("VerificationAlreadyStarted");
            });
        });
    });
});
