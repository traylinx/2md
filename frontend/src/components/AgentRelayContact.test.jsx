import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgentRelayContact, { RELAY_CONTACT_PROMPT, RELAY_ENTRY_URL } from './AgentRelayContact';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AgentRelayContact', () => {
  it('keeps contact distinct from conversion and does not contact Relay on render', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<AgentRelayContact />);
    expect(screen.getByText(/separate from the 2md conversion skill/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read contact instructions' })).toHaveAttribute('href', RELAY_ENTRY_URL);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('copies only the public prompt, with approval boundaries', async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<AgentRelayContact />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy contact prompt' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Nothing has been sent.'));
    expect(writeText).toHaveBeenCalledWith(RELAY_CONTACT_PROMPT);
    expect(RELAY_CONTACT_PROMPT).toContain('wait for my explicit confirmation');
    expect(RELAY_CONTACT_PROMPT).not.toContain('support@');
  });

  it('offers a visible manual copy fallback when clipboard is denied', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    render(<AgentRelayContact />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy contact prompt' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Clipboard unavailable'));
    expect(screen.getByText(RELAY_CONTACT_PROMPT).closest('details')).toHaveAttribute('open');
    expect(screen.queryByText('Copied contact prompt')).not.toBeInTheDocument();
  });
});
