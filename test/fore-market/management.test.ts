import { BasicMarket } from "@/BasicMarket";
import { ForeProtocol } from "@/ForeProtocol";
import { BasicFactory } from "@/BasicFactory";
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
    deployLibrary,
    deployMockedContract,
    impersonateContract,
    txExec,
} from "../helpers/utils";
import { ERC20 } from "@/ERC20";
import { TokenIncentiveRegistry } from "@/TokenIncentiveRegistry";

describe("ForeMarket / Management", () => {
    let foundationWallet: SignerWithAddress;
    let highGuardAccount: SignerWithAddress;
    let marketplaceContract: SignerWithAddress;
    let basicFactoryAccount: Signer;
    let protocolConfig: MockContract<ProtocolConfig>;
    let foreToken: MockContract<ForeToken>;
    let foreVerifiers: MockContract<ForeVerifiers>;
    let foreProtocol: MockContract<ForeProtocol>;
    let tokenRegistry: MockContract<TokenIncentiveRegistry>;
    let usdcToken: MockContract<ERC20>;
    let basicFactory: MockContract<BasicFactory>;
    let contract: BasicMarket;

    beforeEach(async () => {
        [, foundationWallet, highGuardAccount, marketplaceContract, ,] =
            await ethers.getSigners();

        // deploy library
        await deployLibrary("MarketLib", ["BasicMarket", "BasicFactory"]);

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

        // preparing fore protocol
        foreProtocol = await deployMockedContract<ForeProtocol>(
            "ForeProtocol",
            protocolConfig.address,
            "https://markets.api.foreprotocol.io/market/"
        );
        await impersonateContract(foreProtocol.address);

        usdcToken = await deployMockedContract<ERC20>(
            "ERC20",
            "USDC",
            "USD Coin"
        );

        // preparing token registry
        tokenRegistry = await deployMockedContract<TokenIncentiveRegistry>(
            "TokenIncentiveRegistry",
            [
                {
                    tokenAddress: usdcToken.address,
                    discountRate: 10,
                },
            ]
        );

        basicFactory = await deployMockedContract<BasicFactory>(
            "BasicFactory",
            foreProtocol.address,
            tokenRegistry.address
        );
        basicFactoryAccount = await impersonateContract(basicFactory.address);

        // factory assignment
        await txExec(foreVerifiers.setProtocol(foreProtocol.address));

        // deployment of market using factory account
        contract = await deployContractAs<BasicMarket>(
            basicFactoryAccount,
            "BasicMarket"
        );
    });

    it("Should return proper factory address", async () => {
        expect(await contract.factory()).to.be.equal(
            await basicFactoryAccount.getAddress()
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

    it("Should return proper market info struct", async () => {
        expect(await contract.marketInfo()).to.be.eql([
            ethers.utils.parseEther("0"), // side A
            ethers.utils.parseEther("0"), // side B
            ethers.utils.parseEther("0"), // verified A
            ethers.utils.parseEther("0"), // verified B
            ethers.constants.AddressZero, // dispute creator
            BigNumber.from(0), // endPredictionTimestamp
            BigNumber.from(0), // startVerificationTimestamp
            0, // result
            false, // confirmed
            false, // solved
        ]);
    });

    it("Should return initial verificationHeight", async () => {
        expect(await contract.verificationHeight()).to.be.equal(0);
    });
});
