import { createContext, useContext } from "react";
import type { PaymentsMode, User } from "./session";

export interface AppContextValue {
  user: User | null;
  payments: PaymentsMode;
  /** Opens sign-in if needed. Resolves true once the user is signed in. */
  requireAccount: (reason: string) => Promise<boolean>;
  flushProject: (id: string) => Promise<void>;
  refreshProject: (id: string) => Promise<void>;
}

const noop: AppContextValue = {
  user: null,
  payments: "off",
  requireAccount: async () => false,
  flushProject: async () => undefined,
  refreshProject: async () => undefined,
};

export const AppContext = createContext<AppContextValue>(noop);
export const useApp = () => useContext(AppContext);
