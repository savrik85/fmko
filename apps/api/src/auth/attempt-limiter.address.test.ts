import { describe, expect, it } from "vitest";
import { LOGIN_EMAIL_HARD_MAX, judgeLogin, normalizeClientAddress } from "./attempt-limiter";

describe("adresa pro počítadla pokusů", () => {
  it("IPv4 zůstává celá", () => {
    expect(normalizeClientAddress("203.0.113.7")).toBe("203.0.113.7");
  });

  it("IPv6 se počítá po rozsahu /64, střídání adres v něm nepomůže", () => {
    const a = normalizeClientAddress("2001:db8:1234:5678:aaaa:bbbb:cccc:dddd");
    const b = normalizeClientAddress("2001:0DB8:1234:5678::1");
    expect(a).toBe("2001:db8:1234:5678::/64");
    expect(b).toBe(a);
    expect(normalizeClientAddress("2001:db8:1234:5679::1")).not.toBe(a);
  });

  it("zkrácený zápis se rozvine", () => {
    expect(normalizeClientAddress("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(normalizeClientAddress("::1")).toBe("0:0:0:0::/64");
  });
});

describe("tvrdý strop na e-mail", () => {
  it("nad stropem se odmítne i první pokus z nové adresy", () => {
    expect(judgeLogin({ pair: 1, ip: 1, email: LOGIN_EMAIL_HARD_MAX + 1 }).verdict).toBe("blocked");
    expect(judgeLogin({ pair: 1, ip: 1, email: LOGIN_EMAIL_HARD_MAX }).verdict).not.toBe("blocked");
  });
});
