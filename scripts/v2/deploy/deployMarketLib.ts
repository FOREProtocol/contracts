import { ethers } from "hardhat";

async function main() {
  const MarketLibArtifact = await ethers.getContractFactory("MarketLibV2");
  const marketLib = await MarketLibArtifact.deploy();
  await marketLib.deployed();

  console.log("MarketLib deployed to:", marketLib.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
