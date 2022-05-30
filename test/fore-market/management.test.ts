import { ForeMarket } from "@/ForeMarket";
import { ForeMarkets } from "@/ForeMarkets";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers } from "@/ForeVerifiers";
import { ProtocolConfig } from "@/ProtocolConfig";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";
import {
    deployContractAs,
    deployMockedContract,
    impersonateContract,
    txExec,
} from "../helpers/utils";

describe("ForeMarket / Management", () => {
    let owner: SignerWithAddress;
    let foundationWallet: SignerWithAddress;
    let revenueWallet: SignerWithAddress;
    let highGuardAccount: SignerWithAddress;
    let marketplaceContract: SignerWithAddress;
    let foreMarketsAccount: Signer;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

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

        // deployment of market using factory account
        contract = await deployContractAs<ForeMarket>(
            foreMarketsAccount,
            "ForeMarket"
        );

        const previousBlock = await ethers.provider.getBlock("latest");
        blockTimestamp = previousBlock.timestamp;
    });

    it("Should return proper factory address", async () => {
        expect(await contract.factory()).to.be.equal(
            await foreMarketsAccount.getAddress()
        );
    });

    it("Should return null protocol config address", async () => {
        expect(await contract.protocolConfig()).to.be.equal(
            "0x0000000000000000000000000000000000000000"
        );
    });

    it("Should return null market config address", async () => {
        expect(await contract.marketConfig()).to.be.equal(
            "0x0000000000000000000000000000000000000000"
        );
    });

    it("Should return null FORE verifiers address", async () => {
        expect(await contract.foreVerifiers()).to.be.equal(
            "0x0000000000000000000000000000000000000000"
        );
    });

    it("Should return null FORE token address", async () => {
        expect(await contract.foreToken()).to.be.equal(
            "0x0000000000000000000000000000000000000000"
        );
    });

    it("Should return null merket struct", async () => {
        expect(await contract.market()).to.be.eql([
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            BigNumber.from(0),
            BigNumber.from(0),
            BigNumber.from(0),
            BigNumber.from(0),
            BigNumber.from(0),
            BigNumber.from(0),
            BigNumber.from(0),
            0,
        ]);
    });

    it("Should return null privilege NFT struct", async () => {
        expect(await contract.privilegeNft()).to.be.eql([
            "0x0000000000000000000000000000000000000000",
            BigNumber.from(0),
            false,
        ]);
    });

    it("Should return null dispute struct", async () => {
        expect(await contract.dispute()).to.be.eql([
            "0x0000000000000000000000000000000000000000",
            false,
            false,
        ]);
    });

    it("Should return initial verificationHeigth", async () => {
        expect(await contract.verificationHeigth()).to.be.equal(0);
    });
});
