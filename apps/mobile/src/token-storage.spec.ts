/**
 * @jest-environment node
 */

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from './token-storage';

const mockSecureStore = jest.mocked(SecureStore);
const mockAsyncStorage = jest.mocked(AsyncStorage);

describe('token-storage (TP-49)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads from SecureStore first', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue('secure-token');
    await expect(getAccessToken()).resolves.toBe('secure-token');
    expect(mockAsyncStorage.getItem).not.toHaveBeenCalled();
  });

  it('migrates a legacy AsyncStorage token into SecureStore', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue(null);
    mockAsyncStorage.getItem.mockResolvedValue('legacy-token');
    mockSecureStore.setItemAsync.mockResolvedValue(undefined);
    mockAsyncStorage.removeItem.mockResolvedValue(undefined);
    await expect(getAccessToken()).resolves.toBe('legacy-token');
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      'accessToken',
      'legacy-token',
    );
    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('accessToken');
  });

  it('writes to SecureStore and clears AsyncStorage', async () => {
    mockSecureStore.setItemAsync.mockResolvedValue(undefined);
    mockAsyncStorage.removeItem.mockResolvedValue(undefined);
    await setAccessToken('next');
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      'accessToken',
      'next',
    );
    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('accessToken');
  });

  it('clears both stores on logout', async () => {
    mockSecureStore.deleteItemAsync.mockResolvedValue(undefined);
    mockAsyncStorage.removeItem.mockResolvedValue(undefined);
    await clearAccessToken();
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('accessToken');
    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('accessToken');
  });
});
