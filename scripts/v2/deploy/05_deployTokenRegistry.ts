import hre, { ethers, upgrades } from "hardhat";

import { contractAddresses, incentives } from "../constants";

async function main() {
  const network = hre.hardhatArguments.network;

  console.log(`Deploying token registry on ${network}...`);

  const TokenRegistryArtifact = await ethers.getContractFactory(
    "TokenIncentiveRegistry"
  );
  const tokenRegistry = await upgrades.deployProxy(TokenRegistryArtifact, [
    contractAddresses[network].accessManager,
    [contractAddresses[network].foreToken, contractAddresses[network].mockUsdt],
    [incentives.foreToken, incentives.usdt],
  ]);
  await tokenRegistry.deployed();

  console.log("TokenIncentiveRegistry deployed to:", tokenRegistry.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
