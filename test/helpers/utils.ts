import { smock } from "@defi-wonderland/smock";
import { MockContract } from "@defi-wonderland/smock/dist/src/types";
import { Block } from "@ethersproject/abstract-provider";
import { ContractReceipt } from "@ethersproject/contracts/src.ts/index";
import { TypedEvent } from "@typechain/ethers-v5/static/common";
import chai, { expect } from "chai";
import chaiSubset from "chai-subset";
import { solidity } from "ethereum-waffle";
import { Contract, ContractTransaction, Event, Signer } from "ethers";
import { ethers, network } from "hardhat";

chai.use(chaiSubset);
chai.use(solidity);
chai.use(smock.matchers);

export function findEvent<T extends Event>(
    result: ContractReceipt,
    eventName: string,
    offset = 0,
    triggerErrorOnFailure = true
): T {
    if (!result.events?.length) {
        if (triggerErrorOnFailure) {
            expect.fail(`Event ${eventName} not found`);
        } else {
            return null;
        }
    }

    const events = result.events.filter((e) => e.event === eventName);
    if (events.length - 1 < offset) {
        if (triggerErrorOnFailure) {
            expect.fail(`Event ${eventName}#${offset} not found`);
        } else {
            return null;
        }
    }

    return <any>events[offset];
}

export function assertEvent<T extends TypedEvent<any>>(
    result: ContractReceipt,
    eventName: string,
    eventArgs: Partial<T["args"]> = {},
    offset = 0
) {
    const event = findEvent(result, eventName, offset);

    for (const [property, expected] of Object.entries(eventArgs)) {
        const given = event.args[property];
        if (typeof given === "object" && !given._isBigNumber) {
            expect(given).to.containSubset(expected);
        } else {
            expect(given).to.be.eql(expected);
        }
    }
}

export function assertNoEvent<T extends TypedEvent<any>>(
    result: ContractReceipt,
    eventName: string,
    eventArgs: Partial<T["args"]> = {},
    offset = 0
) {
    const event = findEvent(result, eventName, offset, false);
    if (event) {
        expect.fail(`Expected to not found event ${eventName}#${offset}`);
    }
}

type AccountCallback = (account: Signer) => Promise<ContractTransaction>;

export async function assertIsAvailableOnlyForOwner(
    callback: AccountCallback,
    ownerOverride?: Signer,
    errorMessage = "Ownable: caller is not the owner"
) {
    const allAccounts = await ethers.getSigners();

    let owner: Signer = allAccounts[0];
    if (ownerOverride) {
        owner = ownerOverride;
    }

    const ownerAddress = await owner.getAddress();
    const nonOwnerAccounts = allAccounts
        .filter((account) => account.address !== ownerAddress)
        .slice(0, 2);

    for (const account of nonOwnerAccounts) {
        const nonOwnerTx = callback(account);
        await expect(nonOwnerTx).to.be.revertedWith(errorMessage);
    }

    const ownerTx = await callback(owner);
    const result = await ownerTx.wait();
    expect(result.status).to.be.equal(1);
}

export async function mineBlock(delay = 10): Promise<Block> {
    const previousBlock = await ethers.provider.getBlock("latest");
    const nextTimestamp = previousBlock.timestamp + delay;
    await network.provider.send("evm_setNextBlockTimestamp", [nextTimestamp]);
    await network.provider.send("evm_mine");
    return ethers.provider.getBlock("latest");
}

export async function timetravel(timestamp: number): Promise<Block> {
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp]);
    await network.provider.send("evm_mine");
    return ethers.provider.getBlock("latest");
}

export async function txExec(
    txPromise: Promise<ContractTransaction>
): Promise<[ContractTransaction, ContractReceipt]> {
    const tx = await txPromise;
    const result = await tx.wait();

    expect(result.status).to.be.equal(1);

    return [tx, result];
}

export async function executeInSingleBlock(
    callback: () => Promise<Promise<ContractTransaction>[] | void>,
    nextBlockDelay = 10,
    additionalWaitTime = 10
): Promise<ContractTransaction[]> {
    await network.provider.send("evm_setAutomine", [false]);

    const txPromises = await callback();
    await mineBlock(nextBlockDelay);

    await network.provider.send("evm_setAutomine", [true]);

    await mineBlock(additionalWaitTime);

    const txs = [];
    if (txPromises) {
        for (const txPromise of txPromises) {
            const tx = await txPromise;
            const result = await tx.wait(1);

            expect(result.status).to.be.equal(1);
            txs.push(tx);
        }
    }

    return txs;
}

type TxCheckCallback = (
    tx: ContractTransaction,
    reciept: ContractReceipt
) => void;

export async function waitForTxs(
    txs: ContractTransaction[],
    checkCallback?: TxCheckCallback
): Promise<ContractReceipt[]> {
    const results = [];

    for (const tx of txs) {
        const result = await tx.wait(0);
        expect(result.status).to.be.equal(1);

        if (checkCallback) {
            checkCallback(tx, result);
        }

        results.push(result);
    }

    return results;
}

export async function deployContract<T extends Contract>(
    name: string,
    ...args: any[]
): Promise<T> {
    const [owner] = await ethers.getSigners();

    const contractFactory = await ethers.getContractFactory(name);
    const contract: any = await contractFactory.deploy(...args);

    await contract.deployed();

    return contract;
}

export async function deployContractAs<T extends Contract>(
    owner: Signer,
    name: string,
    ...args: any[]
): Promise<T> {
    const contractFactory = await ethers.getContractFactory(name);

    contractFactory.connect(owner);
    const contract: any = await contractFactory.deploy(...args);

    await contract.deployed();

    return contract;
}

export async function deployMockedContract<T extends Contract>(
    name: string,
    ...args: any[]
): Promise<MockContract<T>> {
    const [owner] = await ethers.getSigners();

    const contractFactory = await smock.mock(name);
    const contract: any = await contractFactory.deploy(...args);

    await contract.deployed();

    return contract;
}

export async function deployMockedContractAs<T extends Contract>(
    owner: Signer,
    name: string,
    ...args: any[]
): Promise<T> {
    const contractFactory = await smock.mock(name, owner);
    const contract: any = await contractFactory.deploy(...args);

    await contract.deployed();

    return contract;
}

export async function attachContract<T extends Contract>(
    name: string,
    address: string
): Promise<T> {
    const contractFactory = await ethers.getContractFactory(name);
    return <any>await contractFactory.attach(address);
}

export async function impersonateContract(
    contractAddress: string
): Promise<Signer> {
    await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [contractAddress],
    });

    await network.provider.send("hardhat_setBalance", [
        contractAddress,
        ethers.utils.parseEther("10").toHexString(),
    ]);

    return await ethers.getSigner(contractAddress);
}
