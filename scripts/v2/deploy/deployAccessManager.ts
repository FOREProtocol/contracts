import { ethers } from "hardhat";
import { contractAddresses } from "../constants";

async function main() {
  const accessManagerArtifact = await ethers.getContractFactory(
    "ForeAccessManager"
  );
  const accessManager = await accessManagerArtifact.deploy(
    contractAddresses.foreFoundationMultiSign
  );
  await accessManager.deployed();

  console.log("AccessManager deployed to:", accessManager.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
