import { afterEach, describe, expect, it, vi } from "vitest";
import { SETTLE_REFRESH_DELAYS_MS, trackTx } from "./tx";

const toast = () => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
});

describe("transaction tracking", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not report confirmation after the polling window expires", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    const notifications = toast();
    const onConfirmed = vi.fn();
    const statuses: string[] = [];

    const pending = trackTx("0xabc", notifications, onConfirmed, (status) => statuses.push(status));
    await vi.runAllTimersAsync();
    await pending;

    expect(onConfirmed).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toBe("pending");
    expect(notifications.info).toHaveBeenLastCalledWith(
      "Still pending, check the explorer",
      expect.stringContaining("0xabc"),
    );
  });

  it("reports confirmation only after a successful chain response", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ tx_status: "success" }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));
    const notifications = toast();
    const onConfirmed = vi.fn();

    const confirmed = trackTx("0xdef", notifications, onConfirmed);
    await vi.runAllTimersAsync();
    await confirmed;

    // One refresh at confirmation plus one per settle delay.
    expect(onConfirmed).toHaveBeenCalledTimes(1 + SETTLE_REFRESH_DELAYS_MS.length);
    expect(notifications.success).toHaveBeenCalledWith(
      "Confirmed on-chain",
      expect.stringContaining("0xdef"),
    );
  });

  it("refreshes again after each settle delay, measured from confirmation", async () => {
    const respond = (status: string) => new Response(
      JSON.stringify({ tx_status: status }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(respond("pending"))
      .mockResolvedValueOnce(respond("success")));
    const waits: number[] = [];
    const onConfirmed = vi.fn();
    const statuses: string[] = [];

    await trackTx("0x123", toast(), onConfirmed, (status) => statuses.push(status), {
      sleep: async (ms) => { waits.push(ms); },
    });

    expect(statuses).toEqual(["pending", "success"]);
    expect(onConfirmed).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([8000, 8000, 5000, 10000]);
  });

  it("never refreshes when the transaction aborts on-chain", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ tx_status: "abort_by_response" }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));
    const notifications = toast();
    const onConfirmed = vi.fn();
    const statuses: string[] = [];

    await trackTx("0x456", notifications, onConfirmed, (status) => statuses.push(status), {
      sleep: async () => {},
    });

    expect(onConfirmed).not.toHaveBeenCalled();
    expect(statuses).toEqual(["pending", "failed"]);
    expect(notifications.error).toHaveBeenCalledOnce();
  });
});
