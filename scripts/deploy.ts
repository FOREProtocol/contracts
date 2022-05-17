import { ethers } from "hardhat";

async function main() {
  const config = {
    verifierMintPrice: ethers.utils.parseEther("10000"),
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
    config.verifierMintPrice
  );
  await protocolConfig.deployed();
  console.log("Protocol config deployed to:", protocolConfig.address);

  // Fore Markets
  const MarketsArtifact = await ethers.getContractFactory("ForeMarkets");
  const markets = await MarketsArtifact.deploy(protocolConfig.address);
  await markets.deployed();
  console.log("ForeVerifiers deployed to:", markets.address);
  // Initial settings
  await foretoken.setFactory(markets.address);
  await verifiers.setFactory(markets.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
