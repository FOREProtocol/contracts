import hre, { ethers } from "hardhat";
import { contractAddresses } from "../constants";

async function main() {
  const network = hre.hardhatArguments.network;

  console.log(`Deploying protocol config on ${network}...`);

  const ProtocolConfigArtifact = await ethers.getContractFactory(
    "ProtocolConfig"
  );
  const protocolConfig = await ProtocolConfigArtifact.deploy(
    process.env.FOUNDATION_WALLET,
    process.env.HIGH_GUARD_WALLET,
    contractAddresses[network].marketplace,
    contractAddresses[network].foreToken,
    contractAddresses[network].foreVerifiers,
    ethers.utils.parseEther("10"),
    ethers.utils.parseEther("1000")
  );

  await protocolConfig.deployed();

  console.log(`Protocol config deployed to: ${protocolConfig.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
