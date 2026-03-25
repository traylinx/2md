import { h } from 'preact';
import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import AsyncJobCard from './AsyncJobCard';

describe('AsyncJobCard', () => {
  const defaultProps = {
    jobId: 'job_123',
    status: 'running',
    pageCount: 50,
  };

  it('renders running state correctly', () => {
    const onCancel = vi.fn();
    render(<AsyncJobCard {...defaultProps} onCancel={onCancel} />);

    expect(screen.getByText('Converting 50 pages in background...')).toBeInTheDocument();
    expect(screen.getByText('job_123')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    
    // Check hint is visible
    expect(screen.getByText(/You can close this tab/)).toBeInTheDocument();
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<AsyncJobCard {...defaultProps} onCancel={onCancel} />);
    
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('renders done state with Load Results button', () => {
    const onLoadResults = vi.fn();
    render(
      <AsyncJobCard 
        jobId="job_456" 
        status="done" 
        pageCount={10} 
        onLoadResults={onLoadResults} 
      />
    );

    expect(screen.getByText('Batch conversion complete!')).toBeInTheDocument();
    expect(screen.getByText('job_456')).toBeInTheDocument();
    expect(screen.getByText('Load Results')).toBeInTheDocument();
    
    // Running hint and cancel should NOT be visible
    expect(screen.queryByText(/You can close this tab/)).not.toBeInTheDocument();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Load Results'));
    expect(onLoadResults).toHaveBeenCalledOnce();
  });

  it('renders failed state with error message', () => {
    render(
      <AsyncJobCard 
        jobId="job_789" 
        status="failed" 
        pageCount={5} 
        error="Target site blocked the request" 
      />
    );

    expect(screen.getByText('Job failed')).toBeInTheDocument();
    expect(screen.getByText('job_789')).toBeInTheDocument();
    expect(screen.getByText('Target site blocked the request')).toBeInTheDocument();
    
    // Load results and cancel should NOT be visible
    expect(screen.queryByText('Load Results')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
  });
});
