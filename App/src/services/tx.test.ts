import { afterEach, describe, expect, it, vi } from "vitest";
import { trackTx } from "./tx";

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

    expect(onConfirmed).toHaveBeenCalledOnce();
    expect(notifications.success).toHaveBeenCalledWith(
      "Confirmed on-chain",
      expect.stringContaining("0xdef"),
    );
  });
});
