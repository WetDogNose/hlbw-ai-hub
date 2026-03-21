import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as stateManager from '../state-manager';
import fs from 'node:fs/promises';
import { TaskStatus } from '../types';

vi.mock('node:fs/promises');

describe('State Manager Tasks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns default state when JSON throws access error', async () => {
    // Just testing that the code logic resolves or creates
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ tasks: [], workers: [] }));
    
    const state = await stateManager.getState();
    expect(state).toHaveProperty('tasks');
  });

  it('adds a new task with pending status', async () => {
    const mockState = { tasks: [], workers: [] };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
    
    await stateManager.addTask({
      title: 'Hello',
      description: 'Test task',
      priority: 3,
      dependencies: [],
      metadata: {}
    });

    expect(fs.writeFile).toHaveBeenCalled();
    const writeCalls = vi.mocked(fs.writeFile).mock.calls;
    const writtenJson = writeCalls[1][1] as string; // Accessing the second write (first is ensureDb)
    const writtenState = JSON.parse(writtenJson);
    expect(writtenState.tasks.length).toBe(1);
    expect(writtenState.tasks[0].status).toBe(TaskStatus.Pending);
  });
});
