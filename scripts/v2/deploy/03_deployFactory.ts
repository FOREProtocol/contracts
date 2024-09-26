import hre, { ethers } from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  const network = hre.hardhatArguments.network;

  console.log(`Deploying factory on ${network}...`);

  const FactoryArtifact = await ethers.getContractFactory("BasicFactoryV2", {
    libraries: {
      MarketLibV2: contractAddresses[network].marketLib,
    },
  });
  const factory = await FactoryArtifact.deploy(
    contractAddresses[network].accessManager,
    contractAddresses[network].protocol,
    contractAddresses[network].tokenRegistry,
    contractAddresses[network].accountWhitelist,
    process.env.FOUNDATION_WALLET,
    contractAddresses[network].router
  );
  await factory.deployed();

  console.log("Factory deployed to:", factory.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
