import { ethers, upgrades } from "hardhat";
import { contractAddresses, incentives } from "../constants";

async function main() {
  const [deployer] = await ethers.getSigners();

  /// Deploy Access Manager
  const ForeAccessManagerArtifact = await ethers.getContractFactory(
    "ForeAccessManager"
  );
  const accessManager = await ForeAccessManagerArtifact.deploy(
    deployer.address
  );
  await accessManager.deployed();
  console.log("AccessManager deployed to:", accessManager.address);

  /// Deploy Token Registry
  const TokenRegistryArtifact = await ethers.getContractFactory(
    "TokenIncentiveRegistry"
  );
  const tokenRegistry = await upgrades.deployProxy(TokenRegistryArtifact, [
    accessManager.address,
    [
      contractAddresses.arbitrumMainnet.foreToken,
      contractAddresses.arbitrumMainnet.usdt,
    ],
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
      contractAddresses.arbitrumMainnet.protocol,
      contractAddresses.arbitrumMainnet.permit2,
      [
        contractAddresses.arbitrumMainnet.foreToken,
        contractAddresses.arbitrumMainnet.usdt,
      ],
    ]
  );
  await foreUniversalRouter.deployed();
  console.log("Router deployed to:", foreUniversalRouter.address);

  /// Deploy Marketlib
  const MarketLibArtifact = await ethers.getContractFactory("MarketLibV2");
  const marketLib = await MarketLibArtifact.deploy();
  await marketLib.deployed();
  console.log("MarketLib deployed to:", marketLib.address);

  /// Prepare Factory
  const UpgradeableBeacon = await ethers.getContractFactory(
    "UpgradeableBeacon"
  );

  const CategoricalMarketImpl = await ethers.getContractFactory(
    "BasicMarketV2"
  );
  const categoricalMarketImpl = await CategoricalMarketImpl.deploy();
  const categoricalMarketBeacon = await UpgradeableBeacon.deploy(
    categoricalMarketImpl.address,
    deployer.address
  );

  const ClassicMarketImpl = await ethers.getContractFactory("BasicMarket");
  const classicMarketImpl = await ClassicMarketImpl.deploy();
  const classicMarketBeacon = await UpgradeableBeacon.deploy(
    classicMarketImpl.address,
    deployer.address
  );

  const FactoryArtifact = await ethers.getContractFactory("BeaconFactory", {
    libraries: {
      MarketLibV2: marketLib.address,
    },
  });

  const factory = await FactoryArtifact.deploy(
    accessManager.address,
    categoricalMarketBeacon.address,
    classicMarketBeacon.address,
    contractAddresses.arbitrumMainnet.protocol,
    tokenRegistry.address,
    accountWhitelist.address,
    process.env.FOUNDATION_WALLET,
    foreUniversalRouter.address
  );
  await factory.deployed();
  console.log("Factory deployed to:", factory.address);

  /// Whitelist factory
  const ProtocolConfigArtifact = await ethers.getContractFactory(
    "ProtocolConfig"
  );
  const protocolConfig = ProtocolConfigArtifact.attach(
    contractAddresses.arbitrumMainnet.protocolConfig
  );
  await protocolConfig.setFactoryStatus([factory.address], [true]);
  console.log(
    `Successfully set factory status with this address: ${factory.address}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
