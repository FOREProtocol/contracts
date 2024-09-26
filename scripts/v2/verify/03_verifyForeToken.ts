import hre from "hardhat";
import { contractAddresses } from "../constants";

async function main() {
  const network = hre.hardhatArguments.network;

  console.log(`Verifying fore token on ${network}...`);

  await hre.run("verify:verify", {
    address: contractAddresses[network].foreToken,
    constructorArguments: [],
  });
  console.log("Contract verified on Etherscan");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
