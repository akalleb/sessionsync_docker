import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger, SIDEBAR_COOKIE_NAME } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const location = useLocation();
  
  // Get sidebar state from cookie
  const getSidebarState = () => {
    const cookies = document.cookie.split(';');
    const sidebarCookie = cookies.find(c => c.trim().startsWith(`${SIDEBAR_COOKIE_NAME}=`));
    if (!sidebarCookie) return true; // Default to true if no cookie
    return sidebarCookie.split('=')[1] === 'true';
  };

  const defaultOpen = getSidebarState();

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <Sidebar />
      <SidebarInset className="bg-gradient-to-br from-background via-background to-muted/20 min-h-screen">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border/40 bg-background/60 backdrop-blur-md sticky top-0 z-0 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 px-4 shadow-sm">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </header>
        <main className="flex-1 p-2 md:p-4 pt-4 overflow-x-hidden">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
