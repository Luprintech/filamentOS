import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Github, Youtube, Instagram, FlaskConical } from 'lucide-react';
import { GoogleIcon, TikTokIcon } from '@/components/icons';
import { useAuth } from '@/context/auth-context';
import { Loader2 } from 'lucide-react';
import { PrivacyPolicyModal } from '@/components/privacy-policy-modal';
import { useTranslation } from 'react-i18next';

export function LoginPage() {
  const { loginWithGoogle, loading } = useAuth();
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [devLoading, setDevLoading] = useState(false);
  const [devError, setDevError] = useState('');
  const [isDevMode, setIsDevMode] = useState(false);

  // Detecta en tiempo de ejecución si el backend corre en modo desarrollo
  useEffect(() => {
    fetch('/api/dev/ping', { credentials: 'include' })
      .then((r) => { if (r.ok) setIsDevMode(true); })
      .catch(() => { /* modo producción, no pasa nada */ });
  }, []);

  async function handleDevLogin() {
    setDevLoading(true);
    setDevError('');
    try {
      const res = await fetch('/api/dev/login-seed', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setDevError(body.error ?? 'Error desconocido');
        return;
      }
      window.location.reload();
    } catch {
      setDevError('No se pudo conectar al backend');
    } finally {
      setDevLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between bg-background p-4 sm:p-8">
      <div className="flex w-full flex-grow items-center justify-center">
        <div className="w-full max-w-md text-center animate-fade-in">

          <img
            src="/Logo.svg"
            alt="Logo de Luprintech"
            width={150}
            height={150}
            className="mx-auto mb-6 rounded-full shadow-lg border border-gray-200"
          />

          <div className="mb-4 mt-8">
            <h1 className="font-headline text-3xl font-bold tracking-tighter text-primary sm:text-5xl lg:text-6xl">
              {t('app_title')}
            </h1>
            <p className="font-headline text-2xl text-muted-foreground">
              {t('login_by')}
            </p>
          </div>

          <p className="mx-auto mt-4 max-w-sm text-lg text-muted-foreground">
            {t('login_tagline')}
          </p>

          <div className="mt-8 space-y-3">
            <Button
              onClick={loginWithGoogle}
              disabled={loading}
              className="w-full rounded-2xl shadow-md transition-all hover:shadow-lg"
              size="lg"
            >
              {loading
                ? <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                : <GoogleIcon className="mr-3 h-6 w-6" />
              }
              {t('login_btn')}
            </Button>

            {/* ── Dev login (solo en desarrollo) ─────────────────────────── */}
            {isDevMode && (
              <div>
                <Button
                  onClick={handleDevLogin}
                  disabled={devLoading}
                  variant="outline"
                  className="w-full rounded-2xl border-dashed border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 hover:text-yellow-300"
                  size="lg"
                >
                  {devLoading
                    ? <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                    : <FlaskConical className="mr-3 h-5 w-5" />
                  }
                  Dev Login (usuario de seed)
                </Button>
                {devError && (
                  <p className="mt-2 text-xs text-destructive">{devError}</p>
                )}
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Requiere haber ejecutado <code className="bg-muted px-1 rounded">npm run seed</code> en el backend.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="w-full py-6 text-center text-sm text-muted-foreground">
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
          {t('login_contact')}{' '}
          <a href="mailto:luprintech@gmail.com" className="text-primary hover:underline">
            luprintech@gmail.com
          </a>
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


