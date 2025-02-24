import hre, { ethers } from "hardhat";
import {
  PROPOSAL_THRESHOLD,
  VOTING_DELAY,
  VOTING_PERIOD,
} from "../../../test/helpers/constants";

import { contractAddresses } from "../constants";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = hre.hardhatArguments.network;

  console.log(`Verifying governor on ${network}...`);

  await hre.run("verify:verify", {
    address: contractAddresses[network].governorDelegator,
    constructorArguments: [
      contractAddresses[network].timelock,
      contractAddresses[network].foreToken,
      deployer.address,
      contractAddresses[network].governorDelegate,
      VOTING_PERIOD,
      VOTING_DELAY,
      PROPOSAL_THRESHOLD,
    ],
  });

  console.log("Governor verified on Etherscan");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
