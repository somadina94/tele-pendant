import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from './sidebar';

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('sidebar extra coverage', () => {
  afterEach(() => {
    stubMatchMedia(false);
  });

  it('opens mobile sheet sidebar', () => {
    stubMatchMedia(true);
    render(
      <SidebarProvider>
        <Sidebar collapsible="offcanvas" side="right" variant="floating">
          <SidebarHeader>Head</SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <span>Group</span>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive
                      variant="outline"
                      size="sm"
                      tooltip="Tip"
                    >
                      Item
                    </SidebarMenuButton>
                    <SidebarMenuButton>More</SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarSeparator />
        </Sidebar>
        <SidebarInset>
          <SidebarTrigger />
          Body
        </SidebarInset>
      </SidebarProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Toggle Sidebar/i }));
    expect(screen.getByText('Item')).toBeInTheDocument();
  });

  it('supports controlled open and icon collapse', () => {
    stubMatchMedia(false);
    const onOpenChange = vi.fn();
    function ForceOpen() {
      const { setOpen } = useSidebar();
      return (
        <button type="button" onClick={() => setOpen(true)}>
          force-open
        </button>
      );
    }
    const { unmount } = render(
      <SidebarProvider open={false} onOpenChange={onOpenChange}>
        <Sidebar collapsible="icon" variant="inset" side="left">
          <SidebarContent>Icon mode</SidebarContent>
        </Sidebar>
        <SidebarTrigger onClick={() => undefined} />
        <ForceOpen />
      </SidebarProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Toggle Sidebar/i }));
    expect(onOpenChange).toHaveBeenCalled();
    fireEvent.click(screen.getByText('force-open'));
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    unmount();

    function ForceToggle() {
      const { setOpen } = useSidebar();
      return (
        <button type="button" onClick={() => setOpen((value) => !value)}>
          force-toggle
        </button>
      );
    }
    render(
      <SidebarProvider defaultOpen>
        <Sidebar collapsible="icon">
          <SidebarContent>
            <SidebarMenuButton tooltip="Only string">Solo</SidebarMenuButton>
          </SidebarContent>
        </Sidebar>
        <ForceToggle />
      </SidebarProvider>,
    );
    fireEvent.click(screen.getByText('force-toggle'));
  });

  it('renders submenu buttons in both sizes and asChild', () => {
    stubMatchMedia(false);
    render(
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton size="sm" isActive>
                      Small
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild size="md">
                      <a href="/child">Child link</a>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>,
    );
    expect(screen.getByText('Small')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Child link' }),
    ).toBeInTheDocument();
  });
});
