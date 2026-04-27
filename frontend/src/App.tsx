import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Youtube, Instagram, LogOut, Sun, Moon, Download,
  Calculator as CalculatorIcon, BarChart3, LineChart, Package, FlaskConical, Info, Menu, X,
} from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { CalculatorForm } from '@/components/calculator-form';
import { TikTokIcon } from '@/components/icons';
import { formSchema, type FormData } from '@/lib/schema';
import { defaultFormValues } from '@/lib/defaults';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { useCookieConsent } from '@/hooks/use-cookie-consent';
import { CookieBanner } from '@/components/cookie-banner';
import { PrivacyPolicyModal } from '@/components/privacy-policy-modal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FilamentTracker } from '@/components/filament-challenge/filament-tracker';
import { GlobalBackground } from '@/components/global-background';
import { CostProjectsPanel } from '@/components/cost-projects-panel';
import { LanguageSelector } from '@/components/language-selector';
import { CurrencySelector } from '@/components/currency-selector';
import { CurrencyProvider } from '@/context/currency-context';
import { ErrorBoundary } from '@/components/error-boundary';
import { QueryProvider } from '@/components/query-provider';
import { AboutModal } from '@/components/about-modal';
import { BuyMeCoffeeButton } from '@/components/buy-me-coffee-button';
import { InventoryDashboard } from '@/features/inventory';
import { HomePage } from '@/pages/HomePage';
import { ChatBotBobina } from '@/components/chatbot-bobina';
import { IosInstallBanner } from '@/components/ios-install-banner';

const StatsDashboard = React.lazy(() =>
  import('@/features/stats/components/stats-dashboard').then((m) => ({ default: m.StatsDashboard }))
);

// ── Theme toggle ──────────────────────────────────────────────────────────────
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useTranslation();
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={resolvedTheme === 'dark' ? t('theme_dark') : t('theme_light')}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

// ── Ruta protegida ────────────────────────────────────────────────────────────
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isGuest, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated && !isGuest) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// ── Ruta raíz: landing si no autenticado, app si sí ──────────────────────────
function RootRoute() {
  const { isAuthenticated, isGuest, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (isAuthenticated || isGuest) return <Navigate to="/calculadora" replace />;
  return <HomePage />;
}

// ── App principal ─────────────────────────────────────────────────────────────
function AppShell() {
  const { user, logout, loginWithGoogle, loading: authLoading, isGuest, exitGuest } = useAuth();
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const logoSrc = resolvedTheme === 'dark' ? '/filamentos_negro.png' : '/filamentos_blanco.png';
  const { canInstall, install } = usePwaInstall();
  const [projectRefreshKey, setProjectRefreshKey] = React.useState(0);
  const [isDevMode, setIsDevMode] = React.useState(false);
  const [devLoading, setDevLoading] = React.useState(false);
  const [aboutOpen, setAboutOpen] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  React.useEffect(() => {
    fetch('/api/dev/ping', { credentials: 'include' })
      .then((r) => { if (r.ok) setIsDevMode(true); })
      .catch(() => {});
  }, []);

  async function handleDevLogin() {
    setDevLoading(true);
    try {
      const res = await fetch('/api/dev/login-seed', { method: 'POST', credentials: 'include' });
      if (res.ok) window.location.reload();
    } finally {
      setDevLoading(false);
    }
  }

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultFormValues,
  });
  const currentYear = new Date().getFullYear();

  const displayName = user?.name ?? user?.email ?? (isGuest ? 'Invitado' : '');
  const avatarUrl = user?.photo ?? undefined;
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <main className="flex min-h-screen flex-col items-center px-4 pb-10 pt-6 sm:px-8 md:px-10">
      <GlobalBackground />
      <div className="w-full max-w-[1400px]">
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-[0_12px_36px_rgba(2,8,23,0.10)] backdrop-blur-md print:hidden dark:border-white/10 dark:shadow-[0_18px_60px_rgba(0,0,0,0.22)] sm:p-5"
        >
          <div className="flex items-center justify-between gap-3">
            {/* Logo y título */}
            <div className="flex items-center gap-3">
              <img
                src={logoSrc}
                alt={t('logo_alt')}
                width={50}
                height={50}
                className="rounded-full shadow-lg border border-gray-200"
              />
              <div className="text-left">
                <h1 className="font-headline text-xl font-bold tracking-tighter text-primary sm:text-2xl md:text-3xl">
                  {t('app_title')}
                </h1>
                {isGuest ? (
                  <p className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-2 py-0.5 text-[0.65rem] font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                    👀 Modo invitado
                  </p>
                ) : user ? (
                  <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">{t('welcome', { name: displayName })}</p>
                ) : null}
              </div>
            </div>

            <div className="hidden items-center gap-1.5 sm:gap-2 md:flex">
              {canInstall && (
                <Button variant="outline" size="icon" onClick={install} title={t('install_title')}>
                  <Download className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                aria-label="Acerca de FilamentOS"
                onClick={() => setAboutOpen(true)}
                title="Acerca de FilamentOS"
              >
                <Info className="h-4 w-4" />
              </Button>
              <ThemeToggle />
              <LanguageSelector />
              <CurrencySelector />
              {user ? (
                <>
                  <Button onClick={logout} variant="outline" size="icon" title={t('sign_out')}>
                    <LogOut className="h-4 w-4" />
                  </Button>
                  {avatarUrl && (
                    <Avatar className="h-8 w-8 hidden sm:flex">
                      <AvatarImage src={avatarUrl} alt={displayName} />
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                  )}
                </>
              ) : isGuest ? (
                <>
                  <Button onClick={loginWithGoogle} variant="outline" size="sm" className="hidden sm:inline-flex rounded-full font-bold">
                    Iniciar sesión
                  </Button>
                  <Button
                    onClick={loginWithGoogle}
                    variant="outline"
                    size="icon"
                    className="sm:hidden"
                    title="Iniciar sesión"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => { void exitGuest().then(() => { window.location.href = '/'; }); }}
                    variant="ghost"
                    size="icon"
                    title="Salir del modo invitado"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={loginWithGoogle} variant="outline" size="sm" className="hidden sm:inline-flex">
                    {t('sign_in')}
                  </Button>
                  <Button onClick={loginWithGoogle} variant="outline" size="icon" className="sm:hidden" title={t('sign_in')}>
                    <LogOut className="h-4 w-4" />
                  </Button>
                  {isDevMode && (
                    <Button
                      onClick={handleDevLogin}
                      disabled={devLoading}
                      variant="outline"
                      size="icon"
                      className="border-dashed border-yellow-500/60 text-yellow-500 hover:bg-yellow-500/10 hover:text-yellow-400"
                      title="Dev Login — usuario de seed"
                    >
                      {devLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                    </Button>
                  )}
                </>
              )}
            </div>

            <Button
              variant="outline"
              size="icon"
              className="md:hidden"
              aria-label={mobileMenuOpen ? 'Cerrar menu' : 'Abrir menu'}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>

          {mobileMenuOpen && (
            <div className="mt-4 border-t border-border/60 pt-4 md:hidden">
              <div className="mx-auto flex max-w-sm flex-col items-center gap-4 text-center">
                <div className="grid w-full grid-cols-3 place-items-center gap-3">
                  <div className="flex w-full justify-center"><ThemeToggle /></div>
                  <div className="flex w-full justify-center"><LanguageSelector /></div>
                  <div className="flex w-full justify-center"><CurrencySelector /></div>
                </div>

                <div className={`grid w-full gap-2 ${canInstall ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {canInstall && (
                    <Button variant="outline" onClick={install} className="rounded-full font-bold">
                      <Download className="mr-2 h-4 w-4" />
                      {t('install_title')}
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setAboutOpen(true)} className="rounded-full font-bold">
                    <Info className="mr-2 h-4 w-4" />
                    Info
                  </Button>
                </div>

                {user ? (
                  <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-border/60 bg-background/60 px-4 py-4 text-center">
                    {avatarUrl && (
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={avatarUrl} alt={displayName} />
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                    )}
                    <div className="min-w-0 w-full">
                      <p className="truncate text-sm font-bold text-foreground">{displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">{t('welcome', { name: displayName })}</p>
                    </div>
                    <Button
                      onClick={logout}
                      variant="outline"
                      className="w-full rounded-full font-bold"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      {t('sign_out')}
                    </Button>
                  </div>
                ) : isGuest ? (
                  <div className="flex flex-col gap-2">
                    <Button onClick={loginWithGoogle} variant="outline" className="w-full rounded-full font-bold">
                      {t('sign_in')}
                    </Button>
                    <Button
                      onClick={() => { void exitGuest().then(() => { window.location.href = '/'; }); }}
                      variant="ghost"
                      className="w-full rounded-full font-bold"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Salir del modo invitado
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Button onClick={loginWithGoogle} variant="outline" className="w-full rounded-full font-bold">
                      {t('sign_in')}
                    </Button>
                    {isDevMode && (
                      <Button
                        onClick={handleDevLogin}
                        disabled={devLoading}
                        variant="outline"
                        className="w-full rounded-full border-dashed border-yellow-500/60 font-bold text-yellow-500 hover:bg-yellow-500/10 hover:text-yellow-400"
                      >
                        {devLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
                        Dev Login
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {isGuest && (
            <div className="mt-4 rounded-2xl border border-purple-300/40 bg-gradient-to-r from-purple-500/12 via-fuchsia-500/10 to-indigo-500/12 px-4 py-3 text-sm font-semibold text-purple-800 dark:text-purple-200">
              Estás en modo invitado. Crea una cuenta gratuita para guardar tus proyectos.
            </div>
          )}
        </motion.header>

        <Tabs defaultValue="calculator" className="w-full">
          <TabsList className="mb-7 grid h-auto w-full grid-cols-4 rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md p-1.5 print:hidden dark:border-white/10">
            <TabsTrigger value="calculator" className="rounded-xl py-2.5 font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg">
              <CalculatorIcon className="mr-0 h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('tab_calculator')}</span>
            </TabsTrigger>
            <TabsTrigger value="challenge" disabled={isGuest} className="rounded-xl py-2.5 font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg disabled:opacity-45">
              <BarChart3 className="mr-0 h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('tab_tracker')}</span>
            </TabsTrigger>
            <TabsTrigger value="statistics" disabled={isGuest} className="rounded-xl py-2.5 font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg disabled:opacity-45">
              <LineChart className="mr-0 h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('tab_statistics')}</span>
            </TabsTrigger>
            <TabsTrigger value="inventory" className="rounded-xl py-2.5 font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg">
              <Package className="mr-0 h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('tab_inventory')}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calculator">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="relative rounded-[32px] border border-border/70 bg-card/60 backdrop-blur-md shadow-[0_18px_40px_rgba(2,8,23,0.10)] dark:border-white/10 dark:shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
            >
              <div className="relative z-10 space-y-7 p-3 sm:p-4 cost-shell">
                <section className="cost-hero rounded-[26px] border border-border/70 p-4 dark:border-white/[0.10] sm:p-7 lg:p-8">
                  <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs font-bold text-[hsl(var(--challenge-blue))] dark:border-white/[0.08] dark:bg-white/[0.04]">
                    <CalculatorIcon className="h-3.5 w-3.5" />
                    {t('calc_hero_badge')}
                  </div>
                  <h2 className="challenge-gradient-text text-3xl font-black leading-none sm:text-4xl">
                    {t('calc_hero_title')}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground whitespace-nowrap">
                    {t('calc_hero_subtitle')}
                  </p>
                </section>
                <div className="grid grid-cols-1 gap-7 xl:grid-cols-[minmax(0,1fr)_380px]">
                  <CalculatorForm
                    form={form}
                    onProjectSaved={() => setProjectRefreshKey((v) => v + 1)}
                  />
                  <CostProjectsPanel form={form} refreshKey={projectRefreshKey} />
                </div>
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="challenge">
            <FilamentTracker />
          </TabsContent>

          <TabsContent value="statistics">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="rounded-[32px] border border-border/70 bg-card/60 backdrop-blur-md p-5 shadow-[0_18px_40px_rgba(2,8,23,0.10)] dark:border-white/10 dark:shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-6"
            >
              <Suspense fallback={
                <div className="flex items-center justify-center py-20">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              }>
                <StatsDashboard />
              </Suspense>
            </motion.div>
          </TabsContent>

          <TabsContent value="inventory">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="rounded-[32px] border border-border/70 bg-card/60 backdrop-blur-md p-5 shadow-[0_18px_40px_rgba(2,8,23,0.10)] dark:border-white/10 dark:shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-6"
            >
              <InventoryDashboard
                userId={user?.id ?? null}
                authLoading={authLoading}
              />
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer */}
      <footer className="w-full py-6 text-center text-sm text-muted-foreground print:hidden mt-12">
        <div className="flex justify-center gap-6 mb-4">
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
          {t('footer_contact')}{' '}
          <a href="mailto:luprintech@gmail.com" className="text-primary hover:underline">
            luprintech@gmail.com
          </a>
          {' '}{t('footer_contact_social')}
        </p>
        <p className="mb-2">{t('footer_copyright', { year: currentYear })}</p>
        <p>
          <PrivacyPolicyModal
            trigger={
              <button className="text-primary hover:underline underline-offset-2 transition-colors">
                {t('footer_privacy')}
              </button>
            }
          />
        </p>
        <div className="mt-4 border-t border-[#8b5cf6]/15 pt-4">
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-gray-400">¿Te es útil FilamentOS? Puedes invitarme a un café</p>
            <BuyMeCoffeeButton size="md" />
          </div>
        </div>
      </footer>

      <AboutModal open={aboutOpen} onOpenChange={setAboutOpen} />
    </main>
  );
}

// ── AppContent: routing root ──────────────────────────────────────────────────
function AppContent() {
  const { accepted, accept } = useCookieConsent();

  return (
    <>
      <Routes>
        {/* Raíz: landing si no autenticado, app si sí */}
        <Route path="/" element={<RootRoute />} />

        {/* Rutas protegidas (requieren auth real o modo invitado) */}
        <Route
          path="/calculadora"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tracker"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        />
        <Route
          path="/estadisticas"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventario"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!accepted && <CookieBanner onAccept={accept} />}
      <ChatBotBobina />
      <IosInstallBanner />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ErrorBoundary>
        <QueryProvider>
          <CurrencyProvider>
            <BrowserRouter>
              <AuthProvider>
                <AppContent />
                <Toaster />
              </AuthProvider>
            </BrowserRouter>
          </CurrencyProvider>
        </QueryProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
