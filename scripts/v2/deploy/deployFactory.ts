import { ethers } from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  const [owner] = await ethers.getSigners();

  const accessManagerArtifact = await ethers.getContractFactory(
    "ForeAccessManager"
  );
  const accessManager = await accessManagerArtifact.deploy(owner.address);
  await accessManager.deployed();

  console.log("AccessManager deployed to:", accessManager.address);

  const FactoryArtifact = await ethers.getContractFactory("BasicFactoryV2", {
    libraries: {
      MarketLibV2: contractAddresses.marketLib,
    },
  });
  const factory = await FactoryArtifact.deploy(
    accessManager.address,
    contractAddresses.protocol,
    contractAddresses.tokenRegistry,
    contractAddresses.feeReceiver
  );
  await factory.deployed();

  console.log("Factory deployed to:", factory.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
