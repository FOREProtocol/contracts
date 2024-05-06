import { BasicFactory } from "@/BasicFactory";
import { ForeNftMarketplace } from "@/ForeNftMarketplace";
import { ForeProtocol } from "@/ForeProtocol";
import { ForeToken } from "@/ForeToken";
import { ForeVerifiers } from "@/ForeVerifiers";
import { ForeVesting } from "@/ForeVesting";
import { MarketLib } from "@/MarketLib";
import { ProtocolConfig } from "@/ProtocolConfig";
import { ethers } from "hardhat";

const receivers = [
    // input here
];

const config = {
    verifierMintPrice: ethers.utils.parseEther("1000"),
    marketCreationPrice: ethers.utils.parseEther("10"),
    marketplaceOwner: "0x0000000000000000000000000000000000000000", // input here
    foundationWallet: "0x0000000000000000000000000000000000000000", // input here
    highGuard: "0x0000000000000000000000000000000000000000", // input here
};

const existingContract = {
    foreToken: null,
    foreVesting: null,
    foreVerifiers: null,
    protocolConfig: null,
    marketLib: null,
    foreProtocol: null,
    basicFactory: null,
    marketplace: null,
};

async function main() {
    const sharedAccount = new ethers.Wallet(
        process.env.SHARED_ACCOUNT_PRIVATE_KEY,
        ethers.provider
    );

    // ForeToken
    console.log("ForeToken");

    const ForeTokenArtifact = await ethers.getContractFactory("ForeToken");
    let foreToken: ForeToken;

    if (!existingContract.foreToken) {
        console.log("Deploying ForeToken");

        foreToken = await ForeTokenArtifact.deploy();
        await foreToken.deployed();

        console.log(foreToken.address);
    } else {
        foreToken = await ForeTokenArtifact.attach(existingContract.foreToken);
    }

    // ForeVesting
    console.log("ForeVesting");

    const VestingArtifact = await ethers.getContractFactory("ForeVesting");
    let foreVesting: ForeVesting;

    if (!existingContract.foreVesting) {
        console.log("Deploying ForeVesting");

        foreVesting = await VestingArtifact.deploy(foreToken.address);
        await foreVesting.deployed();

        console.log(foreVesting.address);
    } else {
        foreVesting = await VestingArtifact.attach(
            existingContract.foreVesting
        );
    }

    // ForeVerifiers
    console.log("ForeVerifiers");

    const ForeVerifiersArtifact = await ethers.getContractFactory(
        "ForeVerifiers"
    );
    let foreVerifiers: ForeVerifiers;

    if (!existingContract.foreVerifiers) {
        console.log("Deploying ForeVerifiers");

        foreVerifiers = await ForeVerifiersArtifact.deploy("");
        await foreVerifiers.deployed();

        console.log(foreVerifiers.address);
    } else {
        foreVerifiers = await ForeVerifiersArtifact.attach(
            existingContract.foreVerifiers
        );
    }

    // NFT Marketplace
    console.log("Marketplace");

    const MarketplaceArtifact = await ethers.getContractFactory(
        "ForeNftMarketplace"
    );
    let marketplace: ForeNftMarketplace;

    if (!existingContract.marketplace) {
        console.log("Deploying ForeNftMarketplace");

        marketplace = await MarketplaceArtifact.deploy(
            config.marketplaceOwner,
            config.foundationWallet,
            foreToken.address,
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("1000000000")
        );
        await marketplace.deployed();

        console.log(marketplace.address);

        // add fore verifiers to marketplace
        {
            const tx = await marketplace
                .connect(sharedAccount)
                .addCollection(
                    foreVerifiers.address,
                    "0x0000000000000000000000000000000000000000",
                    "0x0000000000000000000000000000000000000000",
                    1200,
                    0,
                    { gasLimit: 500000 }
                );
            await tx.wait();
        }
    } else {
        marketplace = await MarketplaceArtifact.attach(
            existingContract.marketplace
        );
    }

    // Protocol Config
    console.log("ProtocolConfig");

    const ProtocolConfigArtifact = await ethers.getContractFactory(
        "ProtocolConfig"
    );
    let protocolConfig: ProtocolConfig;

    if (!existingContract.protocolConfig) {
        console.log("Deploying ProtocolConfig");

        protocolConfig = await ProtocolConfigArtifact.deploy(
            config.foundationWallet,
            config.highGuard,
            marketplace.address,
            foreToken.address,
            foreVerifiers.address,
            config.marketCreationPrice,
            config.verifierMintPrice
        );
        await protocolConfig.deployed();

        console.log(protocolConfig.address);
    } else {
        protocolConfig = await ProtocolConfigArtifact.attach(
            existingContract.protocolConfig
        );
    }

    // MarketLib
    console.log("ProtocolConfig");

    const MarketLibArtifact = await ethers.getContractFactory("MarketLib");
    let marketLib: MarketLib;

    if (!existingContract.marketLib) {
        console.log("Deploying ProtocolConfig");

        marketLib = await MarketLibArtifact.deploy();
        await marketLib.deployed();

        console.log(marketLib.address);
    } else {
        marketLib = await MarketLibArtifact.attach(existingContract.marketLib);
    }

    // ForeProtocol
    console.log("ForeProtocol");

    const ForeProtocolArtifact = await ethers.getContractFactory(
        "ForeProtocol"
    );
    let foreProtocol: ForeProtocol;

    if (!existingContract.foreProtocol) {
        console.log("Deploying ForeProtocol");

        foreProtocol = await ForeProtocolArtifact.deploy(
            protocolConfig.address,
            ""
        );
        await foreProtocol.deployed();

        console.log(foreProtocol.address);
    } else {
        foreProtocol = await ForeProtocolArtifact.attach(
            existingContract.foreProtocol
        );
    }

    // initial settings
    await foreVerifiers.setProtocol(foreProtocol.address, {
        gasLimit: 10000000,
    });

    // BasicFactory
    console.log("BasicFactory");

    const BasicFactoryArtifact = await ethers.getContractFactory(
        "BasicFactory",
        {
            libraries: {
                MarketLib: marketLib.address,
            },
        }
    );
    let basicFactory: BasicFactory;

    if (!existingContract.basicFactory) {
        console.log("Deploying BasicFactory");

        basicFactory = await BasicFactoryArtifact.deploy(
            foreProtocol.address,
            "0x0000000000000000000000000000000000000000",
            {
                gasLimit: 10000000,
            }
        );
        await basicFactory.deployed();

        console.log(basicFactory.address);
    } else {
        basicFactory = await BasicFactoryArtifact.attach(
            existingContract.basicFactory
        );
    }

    // add factory to protocol
    await protocolConfig.setFactoryStatus([basicFactory.address], [true]);

    // Transfers
    console.log("Starting transfers");
    for (let i = 0; i < receivers.length; i++) {
        await foreToken.transfer(
            receivers[i],
            ethers.utils.parseEther("10000000")
        );
        await foreProtocol.mintVerifier(receivers[i]);
    }
    console.log("Transfers completed");

    console.log({
        foreToken: foreToken.address,
        foreVesting: foreVesting.address,
        foreVerifiers: foreVerifiers.address,
        protocolConfig: protocolConfig.address,
        marketLib: marketLib.address,
        foreProtocol: foreProtocol.address,
        basicFactory: basicFactory.address,
        marketplace: marketplace.address,
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
