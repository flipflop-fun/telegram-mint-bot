/**
 * 统一的用户状态管理器
 * 提供状态管理、超时清理和并发保护功能
 */

export interface UserState {
  step: string;
  data?: any;
  timestamp: number;
}

export class UserStateManager<T extends UserState = UserState> {
  private states = new Map<number, T>();
  private locks = new Map<number, boolean>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  // 默认状态超时时间：30分钟
  private readonly STATE_TIMEOUT = 30 * 60 * 1000;
  // 清理检查间隔：5分钟
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
   * 设置用户状态
   */
  setState(userId: number, state: Omit<T, 'timestamp'>): void {
    const stateWithTimestamp = {
      ...state,
      timestamp: Date.now()
    } as T;
    
    this.states.set(userId, stateWithTimestamp);
  }

  /**
   * 获取用户状态
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
   * 更新用户状态的某个字段
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
   * 清除用户状态
   */
  clearState(userId: number): void {
    this.states.delete(userId);
    this.locks.delete(userId);
  }

  /**
   * 检查用户是否有活跃状态
   */
  hasState(userId: number): boolean {
    return this.getState(userId) !== undefined;
  }

  /**
   * 检查用户是否被锁定（正在执行操作）
   */
  isLocked(userId: number): boolean {
    return this.locks.get(userId) || false;
  }

  /**
   * 锁定用户（防止并发操作）
   */
  lock(userId: number): boolean {
    if (this.isLocked(userId)) {
      return false; // 已经被锁定
    }
    this.locks.set(userId, true);
    return true;
  }

  /**
   * 解锁用户
   */
  unlock(userId: number): void {
    this.locks.delete(userId);
  }

  /**
   * 带锁执行操作
   */
  async withLock<R>(userId: number, operation: () => Promise<R>): Promise<R | null> {
    if (!this.lock(userId)) {
      return null; // 无法获取锁
    }

    try {
      return await operation();
    } finally {
      this.unlock(userId);
    }
  }

  /**
   * 检查状态是否过期
   */
  private isStateExpired(state: T): boolean {
    return Date.now() - state.timestamp > this.STATE_TIMEOUT;
  }

  /**
   * 清理过期状态
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
   * 启动清理定时器
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredStates();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * 停止清理定时器
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * 获取统计信息
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
   * 清理所有状态（用于测试或重启）
   */
  clearAll(): void {
    this.states.clear();
    this.locks.clear();
  }
}

// 创建全局实例
export const globalStateManager = new UserStateManager();

// 进程退出时清理
process.on('SIGINT', () => {
  globalStateManager.stopCleanup();
});

process.on('SIGTERM', () => {
  globalStateManager.stopCleanup();
});