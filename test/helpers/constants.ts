import { BigNumber } from "ethers";

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
} as const;
