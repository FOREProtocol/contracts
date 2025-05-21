import hre, { ethers } from "hardhat";
import { contractAddresses } from "../constants";

async function main() {
  const network = hre.hardhatArguments.network;

  console.log(`Deploying FORE protocol on ${network}...`);

  const ProtocolArtifact = await ethers.getContractFactory("ForeProtocol");
  const protocolConfig = await ProtocolArtifact.deploy(
    contractAddresses[network].protocolConfig,
    process.env.PRODUCTION_PROTOCOL_BASE_URI
  );

  await protocolConfig.deployed();

  console.log(`FORE Protocol deployed to: ${protocolConfig.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
