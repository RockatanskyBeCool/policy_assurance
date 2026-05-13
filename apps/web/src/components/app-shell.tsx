import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  Home,
  Menu,
  Settings,
  ShieldCheck,
  User,
} from 'lucide-react'

const menuItems = [
  { label: 'Dashboard', icon: Home, to: '/' },
  { label: 'Schools', icon: ShieldCheck, to: '/' },
  { label: 'Findings', icon: AlertTriangle, to: '/' },
  { label: 'Evidence', icon: FileSearch, to: '/' },
]

type AppShellProps = Readonly<{
  children: ReactNode
}>

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <div className="app-bg" aria-hidden="true" />
      <header className="topbar">
        <div className="topbar-left">
          <button
            className="icon-button lg:hidden"
            type="button"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen((value) => !value)}
          >
            <Menu size={18} />
          </button>
          <Link className="brand" to="/">
            <span className="brand-mark">SP</span>
            <span className="brand-copy">Policy Assurance</span>
          </Link>
        </div>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="user-menu-button" type="button">
            <span className="user-avatar">
              <User size={16} />
            </span>
            <span className="user-menu-copy">User Context</span>
            <Settings size={15} aria-hidden="true" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="user-menu-content" align="end" sideOffset={12}>
              <DropdownMenu.Label className="user-menu-label">
                User Context
              </DropdownMenu.Label>
              <DropdownMenu.Item className="user-menu-item">Account</DropdownMenu.Item>
              <DropdownMenu.Item className="user-menu-item">Settings</DropdownMenu.Item>
              <DropdownMenu.Item className="user-menu-item">Billing</DropdownMenu.Item>
              <DropdownMenu.Separator className="user-menu-separator" />
              <DropdownMenu.Item className="user-menu-item">Login</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>

      <div className="app-frame">
        <aside
          className="sidebar"
          data-open={sidebarOpen}
          aria-label="Primary navigation"
        >
          <div className="sidebar-top">
            <span className="sidebar-title">Workspace</span>
            <button
              className="icon-button"
              type="button"
              aria-label={sidebarOpen ? 'Collapse navigation' : 'Expand navigation'}
              onClick={() => setSidebarOpen((value) => !value)}
            >
              {sidebarOpen ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
            </button>
          </div>

          <nav className="sidebar-nav">
            {menuItems.map((item) => {
              const Icon = item.icon

              return (
                <Link className="sidebar-link" to={item.to} key={item.label}>
                  <Icon size={18} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </aside>

        {children}
      </div>
    </div>
  )
}
