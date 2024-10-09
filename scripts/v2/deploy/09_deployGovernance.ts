import hre, { ethers } from "hardhat";

import {
  PROPOSAL_THRESHOLD,
  TIME_LOCK_DELAY,
  UINT_MAX,
  VOTING_DELAY,
  VOTING_PERIOD,
} from "../../../test/helpers/constants";
import { contractAddresses } from "../constants";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = hre.hardhatArguments.network;

  console.log(`Deploying timelock on ${network}...`);

  const TimelockFactory = await ethers.getContractFactory("Timelock");
  const timelock = await TimelockFactory.deploy(
    deployer.address,
    TIME_LOCK_DELAY
  );
  await timelock.deployed();
  console.log("Timelock deployed to:", timelock.address);

  const GovernorDelegateFactory = await ethers.getContractFactory(
    "GovernorDelegate"
  );
  const governorDelegate = await GovernorDelegateFactory.deploy();
  await governorDelegate.deployed();
  console.log("GovernorDelegate deployed to:", governorDelegate.address);

  const GovernorDelegatorFactory = await ethers.getContractFactory(
    "GovernorDelegator"
  );
  const governorDelegator = await GovernorDelegatorFactory.deploy(
    timelock.address,
    contractAddresses[network].foreToken,
    deployer.address,
    governorDelegate.address,
    VOTING_PERIOD,
    VOTING_DELAY,
    PROPOSAL_THRESHOLD
  );
  await governorDelegator.deployed();
  console.log("GovernorDelegator deployed to:", governorDelegator.address);

  const governor = GovernorDelegateFactory.attach(governorDelegator.address);

  await timelock._setPendingAdmin(governor.address);
  await governor._initiate();
  await governor._setWhitelistAccountExpiration(deployer.address, UINT_MAX);

  console.log("Governance Initiated!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
