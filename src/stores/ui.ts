import { create } from "zustand";
import { persist } from "zustand/middleware";

// ===== Onboarding Modal =====

interface OnboardingStore {
  step: null | 0 | 1 | 2;        // null = dismissed/completed; 0-2 = active step
  completed: boolean;
  setStep: (step: null | 0 | 1 | 2) => void;
  complete: () => void;
}

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      step: null,
      completed: false,
      setStep: (step) => set({ step }),
      complete: () => set({ step: null, completed: true }),
    }),
    {
      name: "hp-onboarding",
      skipHydration: true, // Prevents SSR hydration mismatch — rehydrate in useEffect
    },
  ),
);

// ===== Notification Bell =====

interface NotificationStore {
  unreadCount: number;
  dropdownOpen: boolean;
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  decrementUnread: () => void;
  setDropdownOpen: (open: boolean) => void;
}

export const useNotificationStore = create<NotificationStore>()((set) => ({
  unreadCount: 0,
  dropdownOpen: false,
  setUnreadCount: (count) => set({ unreadCount: count }),
  incrementUnread: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
  decrementUnread: () =>
    set((s) => ({ unreadCount: Math.max(0, s.unreadCount - 1) })),
  setDropdownOpen: (open) => set({ dropdownOpen: open }),
}));
