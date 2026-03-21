import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getNextAvailableTask } from '../arbiter';
import * as stateManager from '../state-manager';
import { TaskStatus } from '../types';

vi.mock('../state-manager');

describe('getNextAvailableTask', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns null if there are no tasks', async () => {
    vi.mocked(stateManager.getState).mockResolvedValue({ tasks: [], workers: [] });
    const task = await getNextAvailableTask();
    expect(task).toBeNull();
  });

  it('returns null if all pending tasks are blocked by incomplete dependencies', async () => {
    vi.mocked(stateManager.getState).mockResolvedValue({
      tasks: [
        { id: '1', title: 'dep', status: TaskStatus.Pending, priority: 3, dependencies: [], blockedBy: [], createdAt: '', metadata: {} },
        { id: '2', title: 'task', status: TaskStatus.Pending, priority: 3, dependencies: ['1'], blockedBy: [], createdAt: '', metadata: {} },
      ],
      workers: []
    });
    
    // In our simplified mock, task 2 depends on 1 which is not completed.
    // wait, wouldn't task 1 be available? Yes, task 1 has no deps. Let's make task 1 in_progress.
    vi.mocked(stateManager.getState).mockResolvedValue({
      tasks: [
        { id: '1', title: 'dep', status: TaskStatus.InProgress, priority: 3, dependencies: [], blockedBy: [], createdAt: '', metadata: {} },
        { id: '2', title: 'task', status: TaskStatus.Pending, priority: 3, dependencies: ['1'], blockedBy: [], createdAt: '', metadata: {} },
      ],
      workers: []
    });
    const task = await getNextAvailableTask();
    expect(task).toBeNull();
  });

  it('selects the highest priority task that has its dependencies met', async () => {
    vi.mocked(stateManager.getState).mockResolvedValue({
      tasks: [
        { id: 't1', title: 'low prio', status: TaskStatus.Pending, priority: 5, dependencies: [], blockedBy: [], createdAt: '2025-01-01T00:00:00Z', metadata: {} },
        { id: 't2', title: 'high prio', status: TaskStatus.Pending, priority: 1, dependencies: [], blockedBy: [], createdAt: '2025-01-01T00:00:00Z', metadata: {} },
      ],
      workers: []
    });

    const task = await getNextAvailableTask();
    expect(task?.id).toBe('t2');
  });

  it('respects creation time if priorities are equal', async () => {
    vi.mocked(stateManager.getState).mockResolvedValue({
      tasks: [
        { id: 't1', title: 'new task', status: TaskStatus.Pending, priority: 3, dependencies: [], blockedBy: [], createdAt: '2025-01-02T00:00:00Z', metadata: {} },
        { id: 't2', title: 'old task', status: TaskStatus.Pending, priority: 3, dependencies: [], blockedBy: [], createdAt: '2025-01-01T00:00:00Z', metadata: {} },
      ],
      workers: []
    });

    const task = await getNextAvailableTask();
    expect(task?.id).toBe('t2');
  });
});
