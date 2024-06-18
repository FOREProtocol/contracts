import { ethers, upgrades } from "hardhat";

import { contractAddresses, incentives } from "../constants";

async function main() {
  const TokenRegistryArtifact = await ethers.getContractFactory(
    "TokenIncentiveRegistry"
  );
  const tokenRegistry = await upgrades.deployProxy(TokenRegistryArtifact, [
    [contractAddresses.foreToken, contractAddresses.usdt],
    [incentives.foreToken, incentives.usdt],
  ]);
  await tokenRegistry.deployed();

  console.log("TokenIncentiveRegistry deployed to:", tokenRegistry.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
