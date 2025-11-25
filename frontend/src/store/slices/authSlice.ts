import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { KratosSession, KratosIdentity } from '@/lib/kratos/types';
import { getSession, createLogoutFlow, performLogout } from '@/lib/kratos';

interface AuthState {
  session: KratosSession | null;
  user: KratosIdentity | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
}

const initialState: AuthState = {
  session: null,
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,
  error: null,
};

/**
 * Check current session with Kratos
 */
export const checkSession = createAsyncThunk(
  'auth/checkSession',
  async (_, { rejectWithValue }) => {
    try {
      const session = await getSession();
      return session;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Failed to check session'
      );
    }
  }
);

/**
 * Logout user
 */
export const logout = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      const flow = await createLogoutFlow();
      await performLogout(flow.logout_token);
      return true;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Failed to logout'
      );
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setSession: (state, action: PayloadAction<KratosSession | null>) => {
      state.session = action.payload;
      state.user = action.payload?.identity || null;
      state.isAuthenticated = !!action.payload?.active;
      state.error = null;
    },
    clearAuth: (state) => {
      state.session = null;
      state.user = null;
      state.isAuthenticated = false;
      state.error = null;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Check session
      .addCase(checkSession.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(checkSession.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isInitialized = true;
        state.session = action.payload;
        state.user = action.payload?.identity || null;
        state.isAuthenticated = !!action.payload?.active;
      })
      .addCase(checkSession.rejected, (state, action) => {
        state.isLoading = false;
        state.isInitialized = true;
        state.session = null;
        state.user = null;
        state.isAuthenticated = false;
        state.error = action.payload as string;
      })
      // Logout
      .addCase(logout.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(logout.fulfilled, (state) => {
        state.isLoading = false;
        state.session = null;
        state.user = null;
        state.isAuthenticated = false;
      })
      .addCase(logout.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const { setSession, clearAuth, setError } = authSlice.actions;
export default authSlice.reducer;

// Selectors
export const selectAuth = (state: { auth: AuthState }) => state.auth;
export const selectUser = (state: { auth: AuthState }) => state.auth.user;
export const selectIsAuthenticated = (state: { auth: AuthState }) =>
  state.auth.isAuthenticated;
export const selectIsAuthLoading = (state: { auth: AuthState }) =>
  state.auth.isLoading;
export const selectIsAuthInitialized = (state: { auth: AuthState }) =>
  state.auth.isInitialized;
