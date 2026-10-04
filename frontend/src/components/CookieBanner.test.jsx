import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import CookieBanner from './CookieBanner';
afterEach(()=>{cleanup();vi.useRealTimers();localStorage.clear();});
it('bounds mobile width without changing consent behavior or policy',async()=>{
 vi.useFakeTimers();render(<CookieBanner/>);await vi.advanceTimersByTimeAsync(1500);
 const dialog=screen.getByRole('dialog',{name:'Cookie consent'});
 expect(dialog.style.width).toBe('380px');
 expect(dialog.style.maxWidth).toBe('calc(100vw - 3rem)');
 expect(dialog.style.boxSizing).toBe('border-box');
 expect(screen.getByRole('link',{name:'Privacy Policy'})).toHaveAttribute('href','/privacy.html');
 fireEvent.click(screen.getByRole('button',{name:'Decline'}));expect(localStorage.getItem('html2md_cookie_consent')).toBe('declined');
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
