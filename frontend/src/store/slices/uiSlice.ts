import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UIState {
  sidebarOpen: boolean;
  mobileSidebarOpen: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: UIState = {
  sidebarOpen: true,
  mobileSidebarOpen: false,
  loading: false,
  error: null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    toggleMobileSidebar: (state) => {
      state.mobileSidebarOpen = !state.mobileSidebarOpen;
    },
    closeMobileSidebar: (state) => {
      state.mobileSidebarOpen = false;
    },
    openMobileSidebar: (state) => {
      state.mobileSidebarOpen = true;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const {
  toggleSidebar,
  toggleMobileSidebar,
  closeMobileSidebar,
  openMobileSidebar,
  setLoading,
  setError,
} = uiSlice.actions;
export default uiSlice.reducer;
