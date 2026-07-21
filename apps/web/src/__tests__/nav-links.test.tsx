import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import NavLinks from '../app/nav-links';
import { LocaleProvider } from '../lib/i18n';

describe('NavLinks', () => {
  it('renders English labels by default', () => {
    render(
      <LocaleProvider>
        <NavLinks />
      </LocaleProvider>,
    );
    expect(screen.getByText('Cart')).toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('Log in')).toBeInTheDocument();
  });

  it('switches to Bangla labels when the switcher is clicked', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <NavLinks />
      </LocaleProvider>,
    );

    await user.click(screen.getByLabelText('Switch language'));

    expect(screen.getByText('কার্ট')).toBeInTheDocument();
    expect(screen.getByText('অর্ডার')).toBeInTheDocument();
    expect(screen.getByText('লগইন')).toBeInTheDocument();
    // English labels should be gone, not just the Bangla ones added.
    expect(screen.queryByText('Cart')).not.toBeInTheDocument();
  });

  it('switches back to English on a second click', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <NavLinks />
      </LocaleProvider>,
    );

    const toggle = screen.getByLabelText('Switch language');
    await user.click(toggle);
    await user.click(toggle);

    expect(screen.getByText('Cart')).toBeInTheDocument();
  });
});
