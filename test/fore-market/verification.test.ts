import { ForeMarket } from "@/ForeMarket";
import { ForeMarkets, MarketCreatedEvent } from "@/ForeMarkets";
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
    deployMockedContract,
    findEvent,
    impersonateContract,
    timetravel,
    txExec,
} from "../helpers/utils";

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

        // sending funds to Alice
        await txExec(
            foreToken
                .connect(owner)
                .transfer(alice.address, ethers.utils.parseEther("1000"))
        );

        const previousBlock = await ethers.provider.getBlock("latest");
        blockTimestamp = previousBlock.timestamp;

        // creating market
        const [tx, recipt] = await txExec(
            foreMarkets
                .connect(alice)
                .createMarket(
                    "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
                    alice.address,
                    ethers.utils.parseEther("50"),
                    ethers.utils.parseEther("20"),
                    blockTimestamp,
                    blockTimestamp + 200000
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
        await txExec(foreMarkets.connect(owner).mintVerifier(alice.address));
        await txExec(foreMarkets.connect(owner).mintVerifier(bob.address));
    });

    describe("initial state", () => {
        it("Should return proper verifications number", async () => {
            expect(await contract.verificationHeigth()).to.be.equal(0);
        });

        it("Should revert stakeForPrivilege() if executed before predicition end", async () => {
            await expect(
                contract.connect(alice).stakeForPrivilege(0)
            ).to.revertedWith("ForeMarket: Verification started");
        });
    });

    describe("after predicting period ended", () => {
        beforeEach(async () => {
            await timetravel(blockTimestamp + 200001);
        });

        it("Should revert if stakeForPrivilege() executed with non powerful token", async () => {
            await txExec(
                protocolConfig
                    .connect(owner)
                    .setVerifierMintPrice(ethers.utils.parseEther("50"))
            );

            await expect(
                contract.connect(alice).stakeForPrivilege(0)
            ).to.revertedWith("ForeMarket: Not enough power");
        });

        it("Should revert if stakeForPrivilege() executed with non owned token", async () => {
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

            it("Should return proper verifications", async () => {
                expect(await contract.privilegeNft()).to.be.eql([
                    alice.address,
                    BigNumber.from(0),
                    false,
                ]);
            });
        });
    });
});
