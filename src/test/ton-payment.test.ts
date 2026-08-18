import { afterEach, describe, expect, it, vi } from "vitest";
import { sendTonPayment, TREASURY_ADDRESS } from "@/lib/ton";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: { id: "intent-id", memo: "nova:123e4567-e89b-12d3-a456-426614174000" }, error: null }) } },
}));

const payment = { amountTon: 5, telegramId: 123, action: "deposit" as const };

const makeTonConnect = (balanceNano: string) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ balance: balanceNano }),
  }));

  return {
    connected: true,
    account: { address: "0:sender", chain: "-239" },
    sendTransaction: vi.fn().mockResolvedValue({ boc: "signed-boc" }),
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TON treasury payments", () => {
  it("opens wallet confirmation without relying on a third-party balance API", async () => {
    const tonConnect = makeTonConnect("0");

    await expect(sendTonPayment(tonConnect as never, payment)).resolves.toMatchObject({
      boc: "signed-boc",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(tonConnect.sendTransaction).toHaveBeenCalledOnce();
  });

  it("sends a plain mainnet transfer only to the treasury", async () => {
    const tonConnect = makeTonConnect("10000000000");

    await expect(sendTonPayment(tonConnect as never, payment)).resolves.toMatchObject({
      boc: "signed-boc",
    });
    expect(tonConnect.sendTransaction).toHaveBeenCalledWith({
      validUntil: expect.any(Number),
      messages: [{ address: TREASURY_ADDRESS, amount: "5000000000", payload: expect.any(String) }],
    });
  });

  it("blocks testnet wallets before requesting a transfer", async () => {
    const tonConnect = makeTonConnect("10000000000");
    tonConnect.account.chain = "-3";

    await expect(sendTonPayment(tonConnect as never, payment)).rejects.toMatchObject({
      code: "wrong_network",
    });
    expect(tonConnect.sendTransaction).not.toHaveBeenCalled();
  });

  it("still opens the wallet when balance providers are unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const tonConnect = {
      connected: true,
      account: { address: "0:sender", chain: "-239" },
      sendTransaction: vi.fn().mockResolvedValue({ boc: "signed-boc" }),
    };

    await expect(sendTonPayment(tonConnect as never, payment)).resolves.toMatchObject({
      boc: "signed-boc",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(tonConnect.sendTransaction).toHaveBeenCalledOnce();
  });
});