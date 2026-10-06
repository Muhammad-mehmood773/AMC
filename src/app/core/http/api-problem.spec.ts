import { HttpErrorResponse } from '@angular/common/http';
import { BulkOperationService } from '@core/ui/bulk-operation.service';
import { toApiProblem } from './api-problem';

describe('toApiProblem', () => {
  const http = (status: number, error?: unknown) => new HttpErrorResponse({ status, error });

  it('maps status codes to problem kinds', () => {
    expect(toApiProblem(http(401)).kind).toBe('unauthorized');
    expect(toApiProblem(http(403)).kind).toBe('forbidden');
    expect(toApiProblem(http(404)).kind).toBe('not-found');
    expect(toApiProblem(http(409)).kind).toBe('conflict');
    expect(toApiProblem(http(429)).retryable).toBe(true);
    expect(toApiProblem(http(503)).kind).toBe('unavailable');
    expect(toApiProblem(http(504)).kind).toBe('timeout');
    expect(toApiProblem(http(500)).kind).toBe('server');
  });

  it('uses server messages only for validation and conflicts', () => {
    expect(toApiProblem(http(422, { message: 'Email is taken' })).message).toBe('Email is taken');
    expect(toApiProblem(http(500, { message: 'stack trace…' })).message).not.toContain('stack');
  });

  it('detects timeouts and network failures', () => {
    const timeout = new Error('t');
    timeout.name = 'TimeoutError';
    expect(toApiProblem(timeout).kind).toBe('timeout');
    expect(['network', 'offline']).toContain(toApiProblem(http(0)).kind);
  });
});

describe('BulkOperationService', () => {
  it('reports progress, failures and supports cancellation', async () => {
    const bulk = new BulkOperationService();
    const result = await bulk.run('Test', [1, 2, 3], async (n) => { if (n === 2) throw new Error('boom'); }, (n) => `#${n}`);
    expect(result).toEqual({ succeeded: 2, failed: 1, cancelled: false });
    expect(bulk.operation()).toMatchObject({ status: 'finished', done: 3 });
    expect(bulk.operation()?.failures[0]).toEqual({ label: '#2', message: 'boom' });

    const run = bulk.run('Cancel', [1, 2, 3, 4], async () => { bulk.cancel(); }, String);
    expect(await run).toMatchObject({ succeeded: 1, cancelled: true });
  });
});
