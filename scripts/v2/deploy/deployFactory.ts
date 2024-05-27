import { ethers } from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  const FactoryArtifact = await ethers.getContractFactory("BasicFactoryV2", {
    libraries: {
      MarketLibV2: contractAddresses.marketLib,
    },
  });
  const factory = await FactoryArtifact.deploy(
    contractAddresses.protocol,
    contractAddresses.tokenRegistry
  );
  await factory.deployed();

  console.log("Factory deployed to:", factory.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
