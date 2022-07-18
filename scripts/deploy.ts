import { ethers } from "hardhat";
import { deployLibrary } from "../test/helpers/utils";

async function main() {
    const config = {
        verifierMintPrice: ethers.utils.parseEther("10000"),
        marketCreationPrice: ethers.utils.parseEther("10000"),
        foundationWallet: "0x0000000000000000000000000000000000000001",
        revenueWallet: "0x0000000000000000000000000000000000000002",
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
        config.revenueWallet,
        foretoken.address,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("1000000000")
    );
    await marketplace.deployed();
    console.log("ForeMarketplace deployed to:", marketplace.address);

    // add fore verifiers to marketplace
    const tx = await marketplace.addCollection(
        verifiers.address,
        config.revenueWallet,
        "0x0000000000000000000000000000000000000000",
        1000,
        0,
        { gasLimit: 5000000 }
    );
    await tx.wait();

    // Protocol Config
    const ConfigArtifact = await ethers.getContractFactory("ProtocolConfig");
    const protocolConfig = await ConfigArtifact.deploy(
        config.foundationWallet,
        config.revenueWallet,
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

    // const MarketsArtifact = await ethers.getContractFactory("ForeMarkets");
    const markets = await MarketsArtifact.deploy(protocolConfig.address);
    await markets.deployed();
    console.log("ForeMarkets deployed to:", markets.address);

    // Initial settings
    await foretoken.setFactory(markets.address);
    await verifiers.setFactory(markets.address);

    // dump addresses for API purpose
    console.log({
        foreToken: foretoken.address,
        foreVesting: vesting.address,
        foreVerifiers: verifiers.address,
        protocolConfig: protocolConfig.address,
        marketLib: marketLib.address,
        foreMarkets: markets.address,
        marketplace: marketplace.address,
    });

    // test
    const signer = await ethers.provider.getSigner().getAddress();
    await markets.mintVerifier(signer);

    const previousBlock = await ethers.provider.getBlock("latest");
    const blockTimestamp = previousBlock.timestamp;
    const createTx = await markets.createMarket(
        "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
        signer,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("2"),
        blockTimestamp + 120,
        blockTimestamp + 200
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
