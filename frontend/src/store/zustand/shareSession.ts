import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ShareSessionState {
  sessionToken: string;
  email: string;
  courseTitle: string;
  setSession: (token: string, email: string, courseTitle: string) => void;
  clearSession: () => void;
}

export const useShareSession = create<ShareSessionState>()(
  persist(
    (set) => ({
      sessionToken: '',
      email: '',
      courseTitle: '',
      setSession: (sessionToken, email, courseTitle) =>
        set({ sessionToken, email, courseTitle }),
      clearSession: () =>
        set({ sessionToken: '', email: '', courseTitle: '' }),
    }),
    {
      name: 'mirai_share_session',
    }
  )
);
