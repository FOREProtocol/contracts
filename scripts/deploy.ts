import { ethers } from "hardhat";
import { deployLibrary } from "../test/helpers/utils";

async function main() {
    const config = {
        verifierMintPrice: ethers.utils.parseEther("1000"),
        marketCreationPrice: ethers.utils.parseEther("10"),
        foundationWallet: "0x0000000000000000000000000000000000000001",
        highGuard: "0x0000000000000000000000000000000000000003",
    };

    // Fore Token
    const ForeTokenArtifact = await ethers.getContractFactory("ForeToken");
    const foretoken = await ForeTokenArtifact.deploy();
    await foretoken.deployed();
    console.log("ForeToken deployed to:", foretoken.address);

    // Vesting
    const VestingArtifact = await ethers.getContractFactory("ForeVesting");
    const vesting = await VestingArtifact.deploy(foretoken.address);
    await vesting.deployed();
    console.log("Vesting deployed to:", vesting.address);

    // Fore Verifiers Nft
    const VerifiersArtifact = await ethers.getContractFactory("ForeVerifiers");
    const verifiers = await VerifiersArtifact.deploy();
    await verifiers.deployed();
    console.log("ForeVerifiers deployed to:", verifiers.address);

    // NFT Marketplace
    const MarketplaceArtifact = await ethers.getContractFactory(
        "ForeNftMarketplace"
    );
    const marketplace = await MarketplaceArtifact.deploy(
        "0x1547dC7E7CB86717F9fB397423EbeF55EF435Aa4",
        config.foundationWallet,
        foretoken.address,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("1000000000")
    );
    await marketplace.deployed();
    console.log("ForeMarketplace deployed to:", marketplace.address);

    // add fore verifiers to marketplace
    const tx = await marketplace.addCollection(
        verifiers.address,
        config.foundationWallet,
        "0x0000000000000000000000000000000000000000",
        1200,
        0,
        { gasLimit: 5000000 }
    );
    await tx.wait();

    // Protocol Config
    const ConfigArtifact = await ethers.getContractFactory("ProtocolConfig");
    const protocolConfig = await ConfigArtifact.deploy(
        config.foundationWallet,
        config.highGuard,
        marketplace.address,
        foretoken.address,
        verifiers.address,
        config.marketCreationPrice,
        config.verifierMintPrice
    );
    await protocolConfig.deployed();
    console.log("Protocol config deployed to:", protocolConfig.address);

    // Library
    const MarketLib = await ethers.getContractFactory("MarketLib");
    const marketLib = await MarketLib.deploy();
    await marketLib.deployed();

    // Fore Markets
    const MarketsArtifact = await ethers.getContractFactory("ForeMarkets", {
        libraries: {
            MarketLib: marketLib.address,
        },
    });

    // ForeProtocol
    const ForeProtocolArtifact = await ethers.getContractFactory(
        "ForeProtocol"
    );

    const foreProtocol = await ForeProtocolArtifact.deploy(
        protocolConfig.address
    );
    await foreProtocol.deployed();
    console.log("ForeProtocol deployed to:", foreProtocol.address);

    // initial settings
    await foretoken.setProtocol(foreProtocol.address, { gasLimit: 5000000 });
    await verifiers.setProtocol(foreProtocol.address, { gasLimit: 5000000 });

    // Basic Market Factory
    const BasicFactoryArtifact = await ethers.getContractFactory(
        "BasicFactory",
        {
            libraries: {
                MarketLib: marketLib.address,
            },
        }
    );

    const basicFactory = await BasicFactoryArtifact.deploy(
        protocolConfig.address,
        { gasLimit: 5000000 }
    );
    await basicFactory.deployed();
    console.log("BasicFactory deployed to:", basicFactory.address);

    // add factory to protocol
    await protocolConfig.setFactoryStatus([basicFactory.address], [true]);

    // dump addresses for API purpose
    console.log({
        foreToken: foretoken.address,
        foreVesting: vesting.address,
        foreVerifiers: verifiers.address,
        protocolConfig: protocolConfig.address,
        marketLib: marketLib.address,
        foreProtocol: foreProtocol.address,
        marketplace: marketplace.address,
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
