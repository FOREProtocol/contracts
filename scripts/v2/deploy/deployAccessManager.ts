import { ethers } from "hardhat";

async function main() {
  const accessManagerArtifact = await ethers.getContractFactory(
    "AccessManager"
  );
  const accessManager = await accessManagerArtifact.deploy();
  await accessManager.deployed();

  console.log("AccessManager deployed to:", accessManager.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
