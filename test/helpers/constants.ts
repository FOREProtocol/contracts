import { BigNumber, ethers } from "ethers";

export const MaxAllowanceTransferAmount = BigNumber.from(
  "0xffffffffffffffffffffffffffffffffffffffff"
);

export const PERMIT_DETAILS = [
  { name: "token", type: "address" },
  { name: "amount", type: "uint160" },
  { name: "expiration", type: "uint48" },
  { name: "nonce", type: "uint48" },
];

export const PERMIT_TYPES = {
  PermitSingle: [
    { name: "details", type: "PermitDetails" },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" },
  ],
  PermitDetails: PERMIT_DETAILS,
};

export interface PermitSingle {
  details: {
    token: string;
    amount: BigNumber;
    expiration: number;
    nonce: number;
  };
  spender: string;
  sigDeadline: number;
}

export const SIDES = {
  TRUE: 0,
  FALSE: 1,
} as const;

export const defaultIncentives = {
  predictionDiscountRate: 1000,
  marketCreatorDiscountRate: 1000,
  verificationDiscountRate: 1000,
  foundationDiscountRate: 1000,
  marketCreationFee: ethers.utils.parseEther("10"),
} as const;

export const TIME_LOCK_DELAY = 172800;
export const VOTING_PERIOD = 86400;
export const VOTING_DELAY = 86400;
export const PROPOSAL_THRESHOLD = "1000000000000000000000";
export const MORE_THAN_QUORUM_VOTES = BigNumber.from(
  "120000000000000000000000000"
);

export const UINT_MAX = BigInt(Math.pow(2, 255) - 1);

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Arbitrum mainnet addresses
 *
 * */
export const foreProtocolAddress = "0x99Bde3833cEd0968E6Ba2C6616eBDA9691ff164D";

export const permit2Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

export const tokenHolderAddress = "0x42D74ed1ba24D12e5CBD4b220485e5861798378d";

export const foreTokenAddress = "0xcBe94D75ec713B7ead84f55620dc3174beEb1CFe";

export const protocolConfigAddress =
  "0x447A8D6af358f8bdD886B87f9bfE4C83c1B5aF06";

export const protocolConfigOwnerAddress =
  "0x68D29F02e03D1FbAA77B494e961554551Fb197D2";
