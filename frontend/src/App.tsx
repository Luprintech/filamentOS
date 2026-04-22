import React, { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Github, Youtube, Instagram, FolderOpen, LogOut, Sun, Moon, Download, Calculator as CalculatorIcon, BarChart3, LineChart, Package, FlaskConical } from 'lucide-react';
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
import { LanguageSelector } from '@/components/language-selector';
import { ErrorBoundary } from '@/components/error-boundary';
import { QueryProvider } from '@/components/query-provider';

import { InventoryDashboard } from '@/features/inventory';

const StatsDashboard = React.lazy(() =>
  import('@/features/stats/components/stats-dashboard').then((m) => ({ default: m.StatsDashboard }))
);

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

function Calculator() {
  const { user, logout, loginWithGoogle, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const { canInstall, install } = usePwaInstall();
  const [projectRefreshKey, setProjectRefreshKey] = React.useState(0);
  const [isDevMode, setIsDevMode] = React.useState(false);
  const [devLoading, setDevLoading] = React.useState(false);

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

  const displayName = user?.name ?? user?.email ?? '';
  const avatarUrl = user?.photo ?? undefined;
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <main className="flex min-h-screen flex-col items-center px-4 pb-10 pt-6 sm:px-8 md:px-10">
      <div className="w-full max-w-[1400px]">
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 rounded-2xl border border-border/70 bg-card/95 p-4 shadow-[0_12px_36px_rgba(2,8,23,0.10)] backdrop-blur-md print:hidden dark:border-white/10 dark:bg-card/70 dark:shadow-[0_18px_60px_rgba(0,0,0,0.22)] sm:p-5"
        >
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between">
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
                {t('app_title')}
              </h1>
              <p className="text-sm text-muted-foreground">{t('welcome', { name: displayName })}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canInstall && (
              <Button variant="outline" size="sm" onClick={install} title={t('install_title')}>
                <Download className="mr-2 h-4 w-4" /> {t('install')}
              </Button>
            )}
            <ThemeToggle />
            <LanguageSelector />
            {user ? (
              <>
                <Button onClick={logout} variant="outline" size="icon" title={t('sign_out')}>
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
              <>
                <Button onClick={loginWithGoogle} variant="outline" size="sm">
                  {t('sign_in')}
                </Button>
                {isDevMode && (
                  <Button
                    onClick={handleDevLogin}
                    disabled={devLoading}
                    variant="outline"
                    size="sm"
                    className="border-dashed border-yellow-500/60 text-yellow-500 hover:bg-yellow-500/10 hover:text-yellow-400"
                    title="Dev Login — usuario de seed"
                  >
                    {devLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                  </Button>
                )}
              </>
            )}
          </div>
          </div>
        </motion.header>

        <Tabs defaultValue="calculator" className="w-full">
          <TabsList className="mb-7 grid h-auto w-full grid-cols-4 rounded-2xl border border-border/70 bg-card/95 p-1.5 print:hidden dark:border-white/10 dark:bg-card/70 sm:w-[840px]">
            <TabsTrigger value="calculator" className="rounded-xl py-2.5 font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg">
              <CalculatorIcon className="mr-0 h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('tab_calculator')}</span>
            </TabsTrigger>
            <TabsTrigger value="challenge" className="rounded-xl py-2.5 font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg">
              <BarChart3 className="mr-0 h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('tab_tracker')}</span>
            </TabsTrigger>
            <TabsTrigger value="statistics" className="rounded-xl py-2.5 font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg">
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
              className="relative overflow-hidden rounded-[32px] border border-border/70 shadow-[0_18px_40px_rgba(2,8,23,0.10)] dark:border-white/10 dark:shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
            >
              <TrackerGalaxyBackground />
              <div className="relative z-10 space-y-7 p-3 sm:p-4 cost-shell">
                <section className="cost-hero rounded-[26px] border border-border/70 p-4 dark:border-white/[0.10] sm:p-7 lg:p-8">
                  <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs font-bold text-[hsl(var(--challenge-blue))] dark:border-white/[0.08] dark:bg-white/[0.04]">
                    <CalculatorIcon className="h-3.5 w-3.5" />
                    {t('calc_hero_badge')}
                  </div>
                  <h2 className="challenge-gradient-text text-3xl font-black leading-none sm:text-4xl">
                    {t('calc_hero_title')}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {t('calc_hero_subtitle')}
                  </p>
                </section>

                <div className="grid grid-cols-1 gap-7 xl:grid-cols-[minmax(0,1fr)_380px]">
                  <CalculatorForm form={form} onProjectSaved={() => setProjectRefreshKey((value) => value + 1)} />
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
              className="rounded-[32px] border border-border/70 bg-card/95 p-5 shadow-[0_18px_40px_rgba(2,8,23,0.10)] dark:border-white/10 dark:bg-card/70 dark:shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-6"
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
              className="rounded-[32px] border border-border/70 bg-card/95 p-5 shadow-[0_18px_40px_rgba(2,8,23,0.10)] dark:border-white/10 dark:bg-card/70 dark:shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-6"
            >
              <InventoryDashboard
                userId={user?.id ?? null}
                authLoading={authLoading}
              />
            </motion.div>
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
      <ErrorBoundary>
        <QueryProvider>
          <AuthProvider>
            <AppContent />
            <Toaster />
          </AuthProvider>
        </QueryProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
