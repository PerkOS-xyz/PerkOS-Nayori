import { describe, expect, it } from "vitest";
import { NEXT_CONTRACT_ERRORS, humanizeNextError } from "./errors";

describe("next contract error messages", () => {
  it("names the failure from the contract code", () => {
    expect(humanizeNextError(new Error("Transaction failed: (err u314)"))).toBe(NEXT_CONTRACT_ERRORS[314]);
    expect(humanizeNextError("u607")).toMatch(/list is full/);
    expect(humanizeNextError(new Error("abort_by_response (err u601)"))).toMatch(/Register this wallet/);
  });

  it("covers every escrow and applications code", () => {
    for (let code = 300; code <= 316; code++) expect(NEXT_CONTRACT_ERRORS[code]).toBeTruthy();
    for (let code = 600; code <= 612; code++) expect(NEXT_CONTRACT_ERRORS[code]).toBeTruthy();
  });

  it("keeps local validation messages and reports cancelled wallet requests", () => {
    expect(humanizeNextError(new Error("Enter a job description."))).toBe("Enter a job description.");
    expect(humanizeNextError(new Error("User rejected the request"))).toBe("The wallet request was cancelled.");
    expect(humanizeNextError(new Error("socket hang up"))).toMatch(/could not be submitted/);
  });

  it("uses plain copy without em dashes", () => {
    for (const message of Object.values(NEXT_CONTRACT_ERRORS)) expect(message).not.toMatch(/—/);
  });
});
