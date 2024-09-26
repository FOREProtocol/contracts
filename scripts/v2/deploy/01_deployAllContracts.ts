import { ethers, upgrades } from "hardhat";
import { incentives } from "../constants";

const PERMIT_2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

async function main() {
  const [deployer] = await ethers.getSigners();

  /// Deploy Fore Verifiers
  const ForeVerifiersArtifact = await ethers.getContractFactory(
    "ForeVerifiers"
  );
  const foreVerifiers = await ForeVerifiersArtifact.deploy(
    process.env.TESTNET_VERIFIERS_BASE_URI
  );
  await foreVerifiers.deployed();
  console.log("ForeVerifiers deployed to:", foreVerifiers.address);

  /// Deploy FORE Token
  const ForeTokenArtifact = await ethers.getContractFactory("ForeToken");
  const foreToken = await ForeTokenArtifact.deploy();
  await foreToken.deployed();
  console.log("FORE Token deployed to:", foreToken.address);

  /// Deploy Marketplace
  const ForeMarketPlaceArtifact = await ethers.getContractFactory(
    "ForeNftMarketplace"
  );
  const marketplace = await ForeMarketPlaceArtifact.deploy(
    deployer.address,
    process.env.REVENUE_WALLET,
    foreToken.address,
    ethers.utils.parseEther("1"),
    ethers.utils.parseEther("1000000000")
  );
  await marketplace.deployed();
  console.log("FORE NFT Marketplace deployed to:", marketplace.address);

  /// Deploy Protocol Config
  const ProtocolConfigArtifact = await ethers.getContractFactory(
    "ProtocolConfig"
  );
  const protocolConfig = await ProtocolConfigArtifact.deploy(
    process.env.FOUNDATION_WALLET,
    process.env.HIGH_GUARD_WALLET,
    marketplace.address, // marketplace
    foreToken.address, // foreToken
    foreVerifiers.address, // fore verifiers
    ethers.utils.parseEther("10"), // market creation price
    ethers.utils.parseEther("1000") // verifier mint price
  );
  await protocolConfig.deployed();
  console.log("Protocol config deployed to:", protocolConfig.address);

  /// Deploy FORE Protocol
  const ForeProtocolArtifact = await ethers.getContractFactory("ForeProtocol");
  const protocol = await ForeProtocolArtifact.deploy(
    protocolConfig.address,
    process.env.TESTNET_VERIFIERS_BASE_URI
  );
  await protocolConfig.deployed();
  console.log("FORE Protocol deployed to:", protocol.address);

  /// Deploy Access Manager
  const ForeAccessManagerArtifact = await ethers.getContractFactory(
    "ForeAccessManager"
  );
  const accessManager = await ForeAccessManagerArtifact.deploy(
    process.env.FOUNDATION_WALLET
  );
  await accessManager.deployed();
  console.log("AccessManager deployed to:", accessManager.address);

  /// Deploy Mock USDT
  const MockUSDTTokenArtifact = await ethers.getContractFactory("MockUSDT");
  const mockUSDTToken = await MockUSDTTokenArtifact.deploy();
  await mockUSDTToken.deployed();
  console.log("Mock USDT Token deployed to:", mockUSDTToken.address);

  /// Deploy Token Registry
  const TokenRegistryArtifact = await ethers.getContractFactory(
    "TokenIncentiveRegistry"
  );
  const tokenRegistry = await upgrades.deployProxy(TokenRegistryArtifact, [
    accessManager.address,
    [foreToken.address, mockUSDTToken.address],
    [incentives.foreToken, incentives.usdt],
  ]);
  await tokenRegistry.deployed();
  console.log("Token Registry deployed to:", tokenRegistry.address);

  /// Deploy Account Whitelist
  const AccountWhitelistFactory = await ethers.getContractFactory(
    "AccountWhitelist"
  );
  const accountWhitelist = await upgrades.deployProxy(AccountWhitelistFactory, [
    accessManager.address,
    [],
  ]);
  await accountWhitelist.deployed();
  console.log("Account whitelist to:", accountWhitelist.address);

  /// Deploy Universal Router
  const ForeUniversalRouterFactory = await ethers.getContractFactory(
    "ForeUniversalRouter"
  );
  const foreUniversalRouter = await upgrades.deployProxy(
    ForeUniversalRouterFactory,
    [
      accessManager.address,
      protocol.address,
      PERMIT_2_ADDRESS,
      [foreToken.address, mockUSDTToken.address],
    ]
  );
  await foreUniversalRouter.deployed();
  console.log("Router deployed to:", foreUniversalRouter.address);

  /// Deploy Marketlib
  const MarketLibArtifact = await ethers.getContractFactory("MarketLibV2");
  const marketLib = await MarketLibArtifact.deploy();
  await marketLib.deployed();
  console.log("MarketLib deployed to:", marketLib.address);

  /// Deploy Factory
  const FactoryArtifact = await ethers.getContractFactory("BasicFactoryV2", {
    libraries: {
      MarketLibV2: marketLib.address,
    },
  });
  const factory = await FactoryArtifact.deploy(
    accessManager.address,
    protocol.address,
    tokenRegistry.address,
    accountWhitelist.address,
    process.env.FOUNDATION_WALLET,
    foreUniversalRouter.address
  );
  await factory.deployed();
  console.log("Factory deployed to:", factory.address);

  /// Whitelist factory
  await protocolConfig.setFactoryStatus([factory.address], [true]);
  console.log(
    `Successfully set factory status with this address: ${factory.address}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
