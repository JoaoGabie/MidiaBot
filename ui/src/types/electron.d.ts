interface Window {
  electronAPI?: {
    fetch: (path: string, init?: RequestInit) => Promise<ApiResponse<any>>;
  };
}