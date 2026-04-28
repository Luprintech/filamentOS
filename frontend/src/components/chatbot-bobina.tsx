import { useState } from 'react';
import {
  X,
  Search,
  ChevronLeft,
  MessageCircle,
  Send,
  Bot,
  Rocket,
  Calculator,
  FolderOpen,
  Package,
  BarChart3,
  Shield,
  AlertTriangle,
  Smartphone,
  Mail,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { getFaqsForLanguage, FAQCategory, FAQ } from '@/data/faqs';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/auth-context';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

type View = 'categories' | 'questions' | 'answer' | 'contact';

function getCategoryIcon(icon: string) {
  const className = 'h-5 w-5 text-primary';

  switch (icon) {
    case '🚀':
      return <Rocket className={className} />;
    case '🧮':
      return <Calculator className={className} />;
    case '📁':
      return <FolderOpen className={className} />;
    case '🧵':
      return <Package className={className} />;
    case '📊':
    case '📈':
      return <BarChart3 className={className} />;
    case '🔒':
      return <Shield className={className} />;
    case '⚠️':
      return <AlertTriangle className={className} />;
    case '📱':
      return <Smartphone className={className} />;
    case '✨':
      return <Sparkles className={className} />;
    default:
      return <Bot className={className} />;
  }
}

function useContextualWelcome() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  if (pathname.startsWith('/calculadora') || pathname.startsWith('/proyectos')) {
    return t('chatbot_welcome_calculadora');
  }
  if (pathname.startsWith('/bitacora')) {
    return t('chatbot_welcome_bitacora');
  }
  if (pathname.startsWith('/inventario')) {
    return t('chatbot_welcome_inventario');
  }
  if (pathname.startsWith('/estadisticas')) {
    return t('chatbot_welcome_estadisticas');
  }
  return t('chatbot_welcome');
}

export function ChatBotBobina() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { user, isAuthenticated, loginWithGoogle } = useAuth();
  const welcomeMessage = useContextualWelcome();
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<View>('categories');
  const [selectedCategory, setSelectedCategory] = useState<FAQCategory | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<FAQ | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);

  const faqs = getFaqsForLanguage(i18n.resolvedLanguage || i18n.language || 'es');

  const handleCategoryClick = (category: FAQCategory) => {
    setSelectedCategory(category);
    setView('questions');
  };

  const handleQuestionClick = (question: FAQ) => {
    setSelectedQuestion(question);
    setView('answer');
  };

  const handleBack = () => {
    if (view === 'answer') {
      setView('questions');
      setSelectedQuestion(null);
    } else if (view === 'questions') {
      setView('categories');
      setSelectedCategory(null);
    } else if (view === 'contact') {
      setView('categories');
    }
  };

  const validateEmail = async (email: string) => {
    // Validación básica de formato
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError(t('chatbot_email_invalid_format'));
      return false;
    }

    // Verificar el dominio en el backend
    setIsVerifyingEmail(true);
    setEmailError(null);
    
    try {
      const response = await fetch('/api/contact/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      
      if (!response.ok || !data.valid) {
        setEmailError(t('chatbot_email_domain_invalid'));
        return false;
      }

      setEmailError(null);
      return true;
    } catch (error) {
      setEmailError(t('chatbot_email_verify_error'));
      return false;
    } finally {
      setIsVerifyingEmail(false);
    }
  };

  const handleEmailChange = (newEmail: string) => {
    setContactEmail(newEmail);
    setEmailError(null);
  };

  const handleEmailBlur = async () => {
    if (contactEmail.trim()) {
      await validateEmail(contactEmail.trim());
    }
  };

  const handleSendContact = async () => {
    // Usar el email del usuario autenticado o el que haya puesto
    const finalName = contactName.trim() || user?.name || '';
    const finalEmail = contactEmail.trim() || user?.email || '';

    if (!finalName || !finalEmail || !contactMessage.trim()) {
      toast({
        title: t('chatbot_fields_incomplete_title'),
        description: t('chatbot_fields_incomplete_desc'),
        variant: 'destructive',
      });
      return;
    }

    // Validar email antes de enviar
    const isValid = await validateEmail(finalEmail);
    if (!isValid) {
      toast({
        title: t('chatbot_invalid_email_title'),
        description: t('chatbot_invalid_email_desc'),
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch('/api/contact/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: finalName,
          email: finalEmail,
          message: contactMessage,
        }),
      });

      if (!response.ok) {
        throw new Error('Error al enviar el mensaje');
      }

      toast({
        title: t('chatbot_sent_title'),
        description: t('chatbot_sent_desc'),
      });

      // Limpiar formulario
      setContactName('');
      setContactEmail('');
      setContactMessage('');
      setEmailError(null);
      setView('categories');
    } catch (error) {
      toast({
        title: t('chatbot_send_error_title'),
        description: t('chatbot_send_error_desc'),
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleAnotherQuestion = () => {
    setView('categories');
    setSelectedCategory(null);
    setSelectedQuestion(null);
    setSearchTerm('');
  };

  // Filtrar preguntas por búsqueda
  const filteredCategories = searchTerm.trim()
    ? faqs
        .map((cat) => ({
          ...cat,
          questions: cat.questions.filter(
            (q) =>
              q.q.toLowerCase().includes(searchTerm.toLowerCase()) ||
              q.a.toLowerCase().includes(searchTerm.toLowerCase())
          ),
        }))
        .filter((cat) => cat.questions.length > 0)
    : faqs;

  return (
    <>
      {/* Botón flotante */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-40"
          >
            <Button
              onClick={() => setIsOpen(true)}
              size="lg"
              className="h-16 w-16 rounded-full shadow-2xl hover:shadow-primary/50 hover:scale-110 transition-all duration-300 bg-primary"
              aria-label={t('chatbot_open_aria')}
            >
              <div className="relative">
                {/* Icono bobina con animación de giro */}
                <div className="animate-spin-slow">
                  <MessageCircle className="h-8 w-8" />
                </div>
                {/* Punto de notificación */}
                <span className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full animate-pulse" />
              </div>
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Panel del chat */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-50 w-[380px] h-[600px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] bg-background border-2 border-primary/20 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-primary to-primary/80 p-4 flex items-center justify-between text-primary-foreground">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
                  <Bot className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">BOBINA</h3>
                  <p className="text-xs opacity-90 text-justify">{t('chatbot_assistant_subtitle')}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="text-primary-foreground hover:bg-white/20"
                aria-label={t('chatbot_close_aria')}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Contenido */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30">
              {/* Mensaje de bienvenida */}
              {view === 'categories' && !searchTerm && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-background p-4 rounded-xl shadow-sm border border-border/50"
                >
                  <div className="flex gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm leading-relaxed text-justify">
                        {welcomeMessage}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Buscador */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('chatbot_search_placeholder')}
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    if (e.target.value.trim()) {
                      setView('categories');
                    }
                  }}
                  className="pl-10"
                  aria-label={t('chatbot_search_aria')}
                />
              </div>

              {/* Vista: Categorías */}
              {view === 'categories' && (
                <div className="space-y-2">
                  {filteredCategories.map((category) => (
                    <motion.button
                      key={category.category}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => handleCategoryClick(category)}
                      className="w-full text-left p-4 bg-background hover:bg-accent rounded-xl border border-border/50 hover:border-primary/30 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="group-hover:scale-110 transition-transform">
                          {getCategoryIcon(category.icon)}
                        </span>
                        <div className="flex-1">
                          <p className="font-semibold text-sm text-justify">{category.category}</p>
                          <p className="text-xs text-muted-foreground text-justify">
                            {category.questions.length === 1
                              ? t('chatbot_questions_count_singular', { count: category.questions.length })
                              : t('chatbot_questions_count_plural', { count: category.questions.length })}
                          </p>
                        </div>
                      </div>
                    </motion.button>
                  ))}

                  {/* Botón especial para contacto */}
                  {!searchTerm && (
                    <motion.button
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => setView('contact')}
                      className="w-full text-left p-4 bg-primary/5 hover:bg-primary/10 rounded-xl border-2 border-primary/30 hover:border-primary/50 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="group-hover:scale-110 transition-transform">
                          <Mail className="h-5 w-5 text-primary" />
                        </span>
                        <div className="flex-1">
                          <p className="font-semibold text-sm text-primary text-justify">{t('chatbot_report_issue_title')}</p>
                          <p className="text-xs text-muted-foreground text-justify">
                            {t('chatbot_report_issue_subtitle')}
                          </p>
                        </div>
                      </div>
                    </motion.button>
                  )}
                </div>
              )}

              {/* Vista: Preguntas de una categoría */}
              {view === 'questions' && selectedCategory && (
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBack}
                    className="mb-2"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    {t('chatbot_back_categories')}
                  </Button>
                  {selectedCategory.questions.map((question, idx) => (
                    <motion.button
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      onClick={() => handleQuestionClick(question)}
                      className="w-full text-left p-3 bg-background hover:bg-accent rounded-lg border border-border/50 hover:border-primary/30 transition-all text-sm"
                    >
                      {question.q}
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Vista: Respuesta */}
              {view === 'answer' && selectedQuestion && (
                <div className="space-y-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBack}
                    className="mb-2"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    {t('chatbot_back')}
                  </Button>

                  {/* Pregunta del usuario */}
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex justify-end"
                  >
                    <div className="bg-primary text-primary-foreground p-3 rounded-xl max-w-[85%] text-sm">
                      {selectedQuestion.q}
                    </div>
                  </motion.div>

                  {/* Respuesta de BOBINA */}
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex gap-3"
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="bg-background p-4 rounded-xl shadow-sm border border-border/50 flex-1">
                      <p className="text-sm leading-relaxed whitespace-pre-line text-justify">{selectedQuestion.a}</p>
                      {selectedQuestion.showBambuGif && (
                        <div className="mt-3 rounded-lg overflow-hidden border border-border/50">
                          <img
                            src="/exportar-3mf.gif"
                            alt={t('chatbot_bambu_gif_alt')}
                            className="w-full h-auto"
                            loading="lazy"
                          />
                        </div>
                      )}
                    </div>
                  </motion.div>

                  {/* Botón otra pregunta */}
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAnotherQuestion}
                      className="rounded-full"
                    >
                      {t('chatbot_another_question')}
                    </Button>
                  </div>
                </div>
              )}

              {/* Vista: Formulario de contacto */}
              {view === 'contact' && (
                <div className="space-y-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBack}
                    className="mb-2"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    {t('chatbot_back')}
                  </Button>

                  {!isAuthenticated ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-background p-4 rounded-xl shadow-sm border border-border/50"
                    >
                      <div className="flex gap-3 mb-4">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm leading-relaxed mb-3 text-justify">
                            {t('chatbot_login_required')}
                          </p>
                          <Button
                            onClick={loginWithGoogle}
                            className="w-full"
                            variant="default"
                          >
                            {t('sign_in')}
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-background p-4 rounded-xl shadow-sm border border-border/50"
                    >
                      <div className="flex gap-3 mb-4">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm leading-relaxed text-justify">
                            {t('chatbot_contact_intro')}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <Input
                            placeholder={t('chatbot_name_placeholder')}
                            value={contactName || user?.name || ''}
                            onChange={(e) => setContactName(e.target.value)}
                            disabled={isSending}
                          />
                        </div>
                        <div>
                          <Input
                            type="email"
                            placeholder={t('chatbot_email_placeholder')}
                            value={contactEmail || user?.email || ''}
                            onChange={(e) => handleEmailChange(e.target.value)}
                            onBlur={handleEmailBlur}
                            disabled={isSending}
                            className={emailError ? 'border-destructive' : ''}
                          />
                          {isVerifyingEmail && (
                            <p className="text-[10px] text-muted-foreground mt-1 text-justify">
                              {t('chatbot_email_verifying')}
                            </p>
                          )}
                          {emailError && (
                            <p className="text-[10px] text-destructive mt-1 text-justify">
                              ⚠️ {emailError}
                            </p>
                          )}
                          {!emailError && !isVerifyingEmail && (
                            <p className="text-[10px] text-muted-foreground mt-1 text-justify">
                              {t('chatbot_email_hint_editable')}
                            </p>
                          )}
                        </div>
                        <div>
                          <Textarea
                            placeholder={t('chatbot_message_placeholder')}
                            value={contactMessage}
                            onChange={(e) => setContactMessage(e.target.value)}
                            rows={5}
                            disabled={isSending}
                            className="resize-none"
                          />
                        </div>
                        <Button
                          onClick={handleSendContact}
                          disabled={isSending || isVerifyingEmail || !!emailError}
                          className="w-full"
                        >
                          {isSending ? (
                            <>
                              <span className="animate-spin mr-2">⏳</span>
                              {t('chatbot_sending')}
                            </>
                          ) : (
                            <>
                              <Send className="h-4 w-4 mr-2" />
                              {t('chatbot_send')}
                            </>
                          )}
                        </Button>

                        {/* Buy Me a Coffee */}
                        <div className="pt-3 border-t border-border/30 text-center">
                          <p className="text-[11px] text-muted-foreground mb-2 text-justify">
                            {t('chatbot_support_text')}
                          </p>
                          <a
                            href="https://www.buymeacoffee.com/luprintech"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block hover:opacity-80 transition-opacity"
                          >
                            <img
                              src="https://img.buymeacoffee.com/button-api/?text=Alimenta filamentOS&emoji=🧵&slug=luprintech&button_colour=fd99ff&font_colour=000000&font_family=Poppins&outline_colour=000000&coffee_colour=FFDD00"
                              alt={t('chatbot_support_button_alt')}
                              style={{ height: '35px', borderRadius: 6 }}
                            />
                          </a>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              {/* Sin resultados */}
              {filteredCategories.length === 0 && searchTerm && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-background p-4 rounded-xl shadow-sm border border-border/50"
                >
                  <div className="flex gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm leading-relaxed text-justify">
                        {t('chatbot_no_results_prefix')}{' '}
                        <a
                          href="mailto:luprintech@gmail.com"
                          className="text-primary hover:underline font-medium"
                        >
                          luprintech@gmail.com
                        </a>
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Estilos para animación de bobina */}
      <style>{`
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>
    </>
  );
}
