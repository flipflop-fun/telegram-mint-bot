export interface UserState {
  step: string;
  data?: any;
  timestamp: number;
}

export class UserStateManager<T extends UserState = UserState> {
  private states = new Map<number, T>();
  private locks = new Map<number, boolean>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  // Default state timeout: 30 minutes
  private readonly STATE_TIMEOUT = 30 * 60 * 1000;
  // Cleanup check interval: 5 minutes
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000;

  constructor(stateTimeout?: number, cleanupInterval?: number) {
    if (stateTimeout) {
      (this as any).STATE_TIMEOUT = stateTimeout;
    }
    if (cleanupInterval) {
      (this as any).CLEANUP_INTERVAL = cleanupInterval;
    }
    
    this.startCleanupTimer();
  }

  /**
   * setting user state
   */
  setState(userId: number, state: Omit<T, 'timestamp'>): void {
    const stateWithTimestamp = {
      ...state,
      timestamp: Date.now()
    } as T;
    
    this.states.set(userId, stateWithTimestamp);
  }

  /**
   * getting user state
   */
  getState(userId: number): T | undefined {
    const state = this.states.get(userId);
    if (state && this.isStateExpired(state)) {
      this.clearState(userId);
      return undefined;
    }
    return state;
  }

  /**
   * updating user state
   */
  updateState(userId: number, updates: Partial<Omit<T, 'timestamp'>>): boolean {
    const currentState = this.getState(userId);
    if (!currentState) {
      return false;
    }

    const updatedState = {
      ...currentState,
      ...updates,
      timestamp: Date.now()
    } as T;

    this.states.set(userId, updatedState);
    return true;
  }

  /**
   * clearing user state
   */
  clearState(userId: number): void {
    this.states.delete(userId);
    this.locks.delete(userId);
  }

  /**
   * checking if user has active state
   */
  hasState(userId: number): boolean {
    return this.getState(userId) !== undefined;
  }

  /**
   * checking if user is locked (preventing concurrent operations)
   */
  isLocked(userId: number): boolean {
    return this.locks.get(userId) || false;
  }

  /**
   * locking user (preventing concurrent operations)
   */
  lock(userId: number): boolean {
    if (this.isLocked(userId)) {
      return false; // already locked
    }
    this.locks.set(userId, true);
    return true;
  }

  /**
   * unlocking user
   */
  unlock(userId: number): void {
    this.locks.delete(userId);
  }

  /**
   * executing operation with user lock (preventing concurrent operations)
   */
  async withLock<R>(userId: number, operation: () => Promise<R>): Promise<R | null> {
    if (!this.lock(userId)) {
      return null; // cannot get lock
    }

    try {
      return await operation();
    } finally {
      this.unlock(userId);
    }
  }

  /**
   * checking if state is expired
   */
  private isStateExpired(state: T): boolean {
    return Date.now() - state.timestamp > this.STATE_TIMEOUT;
  }

  /**
   * cleaning up expired states
   */
  private cleanupExpiredStates(): void {
    const now = Date.now();
    const expiredUsers: number[] = [];

    for (const [userId, state] of this.states.entries()) {
      if (now - state.timestamp > this.STATE_TIMEOUT) {
        expiredUsers.push(userId);
      }
    }

    for (const userId of expiredUsers) {
      this.clearState(userId);
    }

    if (expiredUsers.length > 0) {
      console.log(`[StateManager] Cleaned up ${expiredUsers.length} expired user states`);
    }
  }

  /**
   * starting cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredStates();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * stopping cleanup timer
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * getting statistics
   */
  getStats(): {
    totalStates: number;
    lockedUsers: number;
    oldestStateAge: number;
  } {
    const now = Date.now();
    let oldestAge = 0;

    for (const state of this.states.values()) {
      const age = now - state.timestamp;
      if (age > oldestAge) {
        oldestAge = age;
      }
    }

    return {
      totalStates: this.states.size,
      lockedUsers: this.locks.size,
      oldestStateAge: oldestAge
    };
  }

  /**
   * cleaning up all states (for testing or restart)
   */
  clearAll(): void {
    this.states.clear();
    this.locks.clear();
  }
}

// creating global instance
export const globalStateManager = new UserStateManager();

// cleaning up on process exit
process.on('SIGINT', () => {
  globalStateManager.stopCleanup();
});

process.on('SIGTERM', () => {
  globalStateManager.stopCleanup();
});