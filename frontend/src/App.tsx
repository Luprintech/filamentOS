import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Github, Youtube, Instagram, FolderOpen, LogOut, Sun, Moon, Download } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { CalculatorForm } from '@/components/calculator-form';
import { TikTokIcon } from '@/components/icons';
import { formSchema, type FormData } from '@/lib/schema';
import { defaultFormValues } from '@/lib/defaults';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { LoginPage } from '@/components/login-page';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { useCookieConsent } from '@/hooks/use-cookie-consent';
import { CookieBanner } from '@/components/cookie-banner';
import { PrivacyPolicyModal } from '@/components/privacy-policy-modal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FilamentTracker } from '@/components/filament-challenge/filament-tracker';
import { TrackerGalaxyBackground } from '@/components/filament-challenge/tracker-galaxy-background';
import { CostProjectsPanel } from '@/components/cost-projects-panel';

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="outline"
      size="icon"
      title={resolvedTheme === 'dark' ? 'Cambiar a modo día' : 'Cambiar a modo noche'}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

function Calculator() {
  const { user, logout, loginWithGoogle } = useAuth();
  const { canInstall, install } = usePwaInstall();
  const [projectRefreshKey, setProjectRefreshKey] = React.useState(0);
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultFormValues,
  });
  const currentYear = new Date().getFullYear();

  const displayName = user?.name ?? user?.email ?? '';
  const avatarUrl = user?.photo ?? undefined;
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 sm:p-8 md:p-12">
      <div className="w-full max-w-5xl">
        <header className="mb-8 flex flex-col items-center gap-4 text-center print:hidden sm:flex-row sm:justify-between">
          <div className="flex items-center gap-4">
            <img
              src="/Logo.svg"
              alt="Logo de Luprintech"
              width={80}
              height={80}
              className="rounded-full shadow-lg border border-gray-200"
            />
            <div className="text-left">
              <h1 className="font-headline text-3xl font-bold tracking-tighter text-primary sm:text-4xl">
                Calculadora 3D
              </h1>
              <p className="text-sm text-muted-foreground">Bienvenido, {displayName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canInstall && (
              <Button variant="outline" size="sm" onClick={install} title="Instalar aplicación">
                <Download className="mr-2 h-4 w-4" /> Instalar
              </Button>
            )}
            <ThemeToggle />
            {user ? (
              <>
                <Button onClick={logout} variant="outline" size="icon" title="Cerrar sesión">
                  <LogOut className="h-4 w-4" />
                </Button>
                {avatarUrl && (
                  <Avatar>
                    <AvatarImage src={avatarUrl} alt={displayName} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                )}
              </>
            ) : (
              <Button onClick={loginWithGoogle} variant="outline" size="sm">
                Iniciar sesión con Google
              </Button>
            )}
          </div>
        </header>

        <Tabs defaultValue="calculator" className="w-full">
          <TabsList className="mb-6 w-full print:hidden sm:w-auto">
            <TabsTrigger value="calculator" className="flex-1 sm:flex-none font-bold">
              🧮 Calculadora de costes
            </TabsTrigger>
            <TabsTrigger value="challenge" className="flex-1 sm:flex-none font-bold">
              📊 Tracker de series
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calculator">
            <div className="relative overflow-hidden rounded-[32px]">
              <TrackerGalaxyBackground />
              <div className="relative z-10 space-y-6 p-1 cost-shell">
                <section className="cost-hero rounded-[28px] border border-white/[0.10] p-6 sm:p-7">
                  <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-[hsl(var(--challenge-blue))]">
                    🧮 Calculadora de costes
                  </div>
                  <h2 className="challenge-gradient-text text-3xl font-black leading-none sm:text-4xl">
                    Calcula, guarda y reutiliza
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    Define tu trabajo, calcula el coste real de impresión y guarda tus proyectos para reutilizarlos cuando quieras.
                  </p>
                </section>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
                  <CalculatorForm form={form} onProjectSaved={() => setProjectRefreshKey((value) => value + 1)} />
                  <CostProjectsPanel form={form} refreshKey={projectRefreshKey} />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="challenge">
            <FilamentTracker />
          </TabsContent>
        </Tabs>
      </div>

      <footer className="w-full py-6 text-center text-sm text-muted-foreground print:hidden mt-12">
        <div className="flex justify-center gap-6 mb-4">
          <a href="https://github.com/luprintech" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="hover:text-primary transition-colors">
            <Github className="h-5 w-5" />
          </a>
          <a href="https://www.youtube.com/@Luprintech" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="hover:text-primary transition-colors">
            <Youtube className="h-5 w-5" />
          </a>
          <a href="https://www.instagram.com/luprintech/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="hover:text-primary transition-colors">
            <Instagram className="h-5 w-5" />
          </a>
          <a href="https://www.tiktok.com/@luprintech" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="hover:text-primary transition-colors">
            <TikTokIcon className="h-5 w-5" />
          </a>
        </div>
        <p className="mb-2">
          ¿Tienes dudas o quieres que implemente alguna mejora? Escríbeme a{' '}
          <a href="mailto:luprintech@gmail.com" className="text-primary hover:underline">
            luprintech@gmail.com
          </a>
          {' '}o contáctame por redes sociales.
        </p>
        <p className="mb-2">&copy; {currentYear} Guadalupe Cano. Todos los derechos reservados.</p>
        <p>
          <PrivacyPolicyModal
            trigger={
              <button className="text-primary hover:underline underline-offset-2 transition-colors">
                Política de Privacidad y Cookies
              </button>
            }
          />
        </p>
      </footer>
    </main>
  );
}

function AppContent() {
  const { loading } = useAuth();
  const { accepted, accept } = useCookieConsent();

  return (
    <>
      {loading ? (
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      ) : (
        <Calculator />
      )}
      {!accepted && <CookieBanner onAccept={accept} />}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <AppContent />
        <Toaster />
      </AuthProvider>
    </ThemeProvider>
  );
}
