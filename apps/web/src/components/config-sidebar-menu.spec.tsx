import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { ConfigSidebarMenu } from './config-sidebar-menu';
import { renderWithProviders } from '../test/render';
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
} from '@/components/ui/sidebar';

describe('ConfigSidebarMenu', () => {
  it('opens config from the sidebar and navigates sections', () => {
    renderWithProviders(
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <ConfigSidebarMenu />
          </SidebarContent>
        </Sidebar>
        <Routes>
          <Route path="/admin" element={<div>Config body</div>} />
          <Route path="/operator" element={<div>Op</div>} />
        </Routes>
      </SidebarProvider>,
      { route: '/operator', role: 'admin' },
    );
    fireEvent.click(screen.getByText('Config'));
    expect(screen.getByText('Config body')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /PLC connections/i }));
    expect(screen.getByText('Config body')).toBeInTheDocument();
  });

  it('toggles config submenu without re-navigating when already there', () => {
    renderWithProviders(
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <ConfigSidebarMenu />
          </SidebarContent>
        </Sidebar>
        <Routes>
          <Route path="/admin" element={<div>On admin</div>} />
        </Routes>
      </SidebarProvider>,
      { route: '/admin?section=plc', role: 'admin' },
    );
    expect(screen.getByText('On admin')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Config'));
    expect(screen.getByText('On admin')).toBeInTheDocument();
  });
});
