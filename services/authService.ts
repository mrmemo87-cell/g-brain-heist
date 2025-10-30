const MOCK_DELAY = 1000;

// Helper to simulate API calls
const mockApiCall = <T,>(data: T, delay: number = MOCK_DELAY): Promise<T> => {
  return new Promise(resolve => setTimeout(() => resolve(data), delay));
};

export const login = (email: string, password: string): Promise<{ success: boolean }> => {
    console.log(`Attempting login for ${email}`);
    // Mock logic: accept any non-empty email/password
    if (email && password) {
        return mockApiCall({ success: true });
    }
    return Promise.reject({ message: 'Invalid credentials' });
};

export const logout = (): Promise<void> => {
    console.log('Logging out');
    return mockApiCall<void>(undefined, 500);
};
