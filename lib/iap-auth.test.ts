import { getIapUser } from "./iap-auth";
import { headers } from "next/headers";

// Mock next/headers
jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

// Mock prisma
jest.mock("./prisma", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: "test-user",
        email: "test@example.com",
        name: "Test",
        role: "USER",
      }),
    },
  },
}));

describe("IAP Auth", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env = originalEnv;
  });

  it("should return null when header is missing in production", async () => {
    Object.defineProperty(process.env, "NODE_ENV", { value: "production" });
    (headers as jest.Mock).mockResolvedValue({
      get: jest.fn().mockReturnValue(null),
    });

    const user = await getIapUser();
    expect(user).toBeNull();
  });

  it("should return local dev user when header is missing in development", async () => {
    Object.defineProperty(process.env, "NODE_ENV", { value: "development" });
    (headers as jest.Mock).mockResolvedValue({
      get: jest.fn().mockReturnValue(null),
    });

    const user = await getIapUser();
    expect(user).toBeDefined();
    expect(user?.id).toBe("dev-local-user");
  });

  it("should return user from DB when header is present", async () => {
    (headers as jest.Mock).mockResolvedValue({
      get: jest.fn().mockReturnValue("accounts.google.com:test@example.com"),
    });

    const user = await getIapUser();
    expect(user).toBeDefined();
    expect(user?.email).toBe("test@example.com");
  });
});
