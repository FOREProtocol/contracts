import { expect } from "chai";
import { MockContract } from "@defi-wonderland/smock";

import { TestArrayUtils } from "@/TestArrayUtils";
import { deployMockedContract } from "../../../helpers/utils";

describe("Libraries / ArrayUtils", () => {
  let contract: MockContract<TestArrayUtils>;

  beforeEach(async () => {
    contract = await deployMockedContract<TestArrayUtils>("TestArrayUtils");
  });

  describe("find max index", () => {
    it("should find max index", async () => {
      expect(await contract.findMaxIndex([1, 2, 3, 4, 5])).to.be.eql(4);
    });

    it("should revert array is empty", async () => {
      await expect(contract.findMaxIndex([])).to.revertedWith(
        "Array must not be empty"
      );
    });
  });
});
