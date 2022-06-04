import { ethers } from "hardhat";
import { deployLibrary } from "../test/helpers/utils";

async function main() {
    const config = {
        verifierMintPrice: ethers.utils.parseEther("10000"),
        marketCreationPrice: ethers.utils.parseEther("10000"),
        foundationWallet: "0x0000000000000000000000000000000000000001",
        revenueWallet: "0x0000000000000000000000000000000000000002",
        highGuard: "0x0000000000000000000000000000000000000003",
        marketplace: "0x0000000000000000000000000000000000000004",
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

    // Protocol Config
    const ConfigArtifact = await ethers.getContractFactory("ProtocolConfig");
    const protocolConfig = await ConfigArtifact.deploy(
        config.foundationWallet,
        config.revenueWallet,
        config.highGuard,
        config.marketplace,
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

    // test
    // const previousBlock = await ethers.provider.getBlock("latest");
    // const blockTimestamp = previousBlock.timestamp;
    // await markets.createMarket(
    //     "0x3fd54831f488a22b28398de0c567a3b064b937f54f81739ae9bd545967f3abab",
    //     "0x959fd7ef9089b7142b6b908dc3a8af7aa8ff0fa1",
    //     ethers.utils.parseEther("1"),
    //     ethers.utils.parseEther("2"),
    //     blockTimestamp + 100000,
    //     blockTimestamp + 200000
    // );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
