import hre, { ethers, upgrades } from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  const network = hre.hardhatArguments.network;

  console.log(`Deploying router on ${network}...`);

  const ForeUniversalRouterFactory = await ethers.getContractFactory(
    "ForeUniversalRouter"
  );
  const foreUniversalRouter = await upgrades.deployProxy(
    ForeUniversalRouterFactory,
    [
      contractAddresses[network].accessManager,
      contractAddresses[network].protocol,
      contractAddresses[network].permit2,
      [
        contractAddresses[network].foreToken,
        contractAddresses[network].mockUsdt,
      ],
    ]
  );
  await foreUniversalRouter.deployed();

  console.log(
    "FORE universal router deployed to:",
    foreUniversalRouter.address
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
