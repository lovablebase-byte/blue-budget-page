import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { MessageSquare, Loader2, ArrowLeft } from 'lucide-react';

export default function Auth() {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success('E-mail de redefinição enviado! Verifique sua caixa de entrada.');
        setMode('login');
      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Login realizado com sucesso!');
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast.success('Conta criada! Verifique seu e-mail para confirmar.');
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro na autenticação');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-bg flex min-h-screen items-center justify-center px-4 py-10 relative overflow-hidden">
      {/* Animated organic blobs */}
      <div
        className="auth-blob"
        style={{
          top: '-8%',
          left: '-6%',
          width: '520px',
          height: '520px',
          background:
            'radial-gradient(circle, hsl(142 100% 45% / 0.32) 0%, hsl(142 100% 45% / 0.10) 50%, transparent 75%)',
          animation: 'auth-blob-float-1 22s ease-in-out infinite',
        }}
      />
      <div
        className="auth-blob"
        style={{
          bottom: '-10%',
          right: '-8%',
          width: '600px',
          height: '600px',
          background:
            'radial-gradient(circle, hsl(165 90% 40% / 0.25) 0%, hsl(195 100% 45% / 0.10) 50%, transparent 75%)',
          animation: 'auth-blob-float-2 28s ease-in-out infinite',
        }}
      />
      <div
        className="auth-blob"
        style={{
          top: '40%',
          right: '15%',
          width: '380px',
          height: '380px',
          background:
            'radial-gradient(circle, hsl(195 100% 50% / 0.18) 0%, hsl(220 80% 40% / 0.08) 50%, transparent 75%)',
          animation: 'auth-blob-float-3 25s ease-in-out infinite',
        }}
      />
      <div
        className="auth-blob hidden md:block"
        style={{
          top: '20%',
          left: '35%',
          width: '300px',
          height: '300px',
          background:
            'radial-gradient(circle, hsl(155 80% 45% / 0.14) 0%, transparent 70%)',
          animation: 'auth-blob-float-1 32s ease-in-out infinite reverse',
        }}
      />

      {/* Soft abstract waves */}
      <svg
        className="auth-wave hidden md:block"
        viewBox="0 0 1440 800"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="authWaveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(142 100% 50%)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="hsl(195 100% 55%)" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path
          d="M0,520 C320,420 520,640 760,520 C1000,400 1200,580 1440,460 L1440,800 L0,800 Z"
          fill="url(#authWaveGrad)"
          opacity="0.35"
        />
        <path
          d="M0,620 C280,560 540,720 820,600 C1080,490 1280,640 1440,580"
          fill="none"
          stroke="hsl(142 100% 55% / 0.18)"
          strokeWidth="1"
        />
      </svg>

      {/* Breathing halo behind card */}
      <div className="auth-halo" />

      {/* Floating particles */}
      {[
        { left: '8%', delay: '0s', dur: '18s', size: 2 },
        { left: '22%', delay: '4s', dur: '22s', size: 3 },
        { left: '38%', delay: '9s', dur: '20s', size: 2 },
        { left: '55%', delay: '2s', dur: '24s', size: 3 },
        { left: '68%', delay: '11s', dur: '19s', size: 2 },
        { left: '82%', delay: '6s', dur: '23s', size: 3 },
        { left: '92%', delay: '14s', dur: '21s', size: 2 },
      ].map((p, i) => (
        <span
          key={i}
          className="auth-particle hidden sm:block"
          style={{
            left: p.left,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animation: `auth-particle-drift ${p.dur} linear infinite`,
            animationDelay: p.delay,
          }}
        />
      ))}

      <div
        className="relative w-full max-w-md rounded-2xl p-[1px] overflow-hidden"
        style={{
          background:
            'linear-gradient(135deg, hsl(142 100% 45% / 0.55), hsl(195 100% 50% / 0.25) 40%, transparent 70%)',
          boxShadow:
            '0 0 80px -20px hsl(142 100% 45% / 0.35), 0 30px 60px -20px rgba(0,0,0,0.6)',
        }}
      >
        {/* Top luminous line */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] z-10 pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, hsl(142 100% 45%) 50%, transparent 100%)',
            boxShadow: '0 0 16px hsl(142 100% 45% / 0.8)',
          }}
        />

        <Card className="relative w-full rounded-[15px] border-0 bg-[hsl(222_47%_6%/0.85)] backdrop-blur-xl !shadow-none hover:!shadow-none hover:!translate-y-0">
          <CardHeader className="text-center pb-4 pt-8">
            <div
              className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[hsl(142_100%_45%/0.4)]"
              style={{
                background:
                  'linear-gradient(135deg, hsl(142 100% 45% / 0.25) 0%, hsl(195 100% 50% / 0.15) 100%)',
                boxShadow:
                  '0 0 24px hsl(142 100% 45% / 0.5), inset 0 0 20px hsl(142 100% 45% / 0.15)',
              }}
            >
              <MessageSquare
                className="h-8 w-8 text-[hsl(142_100%_55%)]"
                style={{ filter: 'drop-shadow(0 0 8px hsl(142 100% 45% / 0.8))' }}
              />
            </div>
            <CardTitle className="text-2xl font-bold text-white tracking-tight">
              WhatsApp Manager
            </CardTitle>
            <CardDescription className="text-white/60 mt-1.5">
              {mode === 'login' && 'Entre na sua conta'}
              {mode === 'signup' && 'Crie uma nova conta'}
              {mode === 'forgot' && 'Recupere sua senha'}
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-white/85 text-sm">
                    Nome completo
                  </Label>
                  <Input
                    id="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Seu nome"
                    required
                    className="h-11 bg-[hsl(222_47%_8%)] border-white/10 text-white placeholder:text-white/40 focus-visible:border-[hsl(142_100%_45%/0.7)] focus-visible:ring-[hsl(142_100%_45%/0.35)] focus-visible:shadow-[0_0_0_3px_hsl(142_100%_45%/0.15),0_0_20px_-4px_hsl(142_100%_45%/0.4)]"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white/85 text-sm">
                  E-mail
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  className="h-11 bg-[hsl(222_47%_8%)] border-white/10 text-white placeholder:text-white/40 focus-visible:border-[hsl(142_100%_45%/0.7)] focus-visible:ring-[hsl(142_100%_45%/0.35)] focus-visible:shadow-[0_0_0_3px_hsl(142_100%_45%/0.15),0_0_20px_-4px_hsl(142_100%_45%/0.4)]"
                />
              </div>
              {mode !== 'forgot' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-white/85 text-sm">
                      Senha
                    </Label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => setMode('forgot')}
                        className="text-xs text-[hsl(142_100%_55%)] hover:text-[hsl(142_100%_70%)] hover:[text-shadow:0_0_8px_hsl(142_100%_45%/0.6)] transition-all"
                      >
                        Esqueceu a senha?
                      </button>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="h-11 bg-[hsl(222_47%_8%)] border-white/10 text-white placeholder:text-white/40 focus-visible:border-[hsl(142_100%_45%/0.7)] focus-visible:ring-[hsl(142_100%_45%/0.35)] focus-visible:shadow-[0_0_0_3px_hsl(142_100%_45%/0.15),0_0_20px_-4px_hsl(142_100%_45%/0.4)]"
                  />
                </div>
              )}
              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-12 mt-2 text-sm font-semibold text-black border-0 transition-all duration-300 hover:brightness-110"
                style={{
                  background:
                    'linear-gradient(135deg, hsl(142 100% 50%) 0%, hsl(142 100% 40%) 100%)',
                  boxShadow:
                    '0 0 24px -4px hsl(142 100% 45% / 0.6), inset 0 1px 0 hsl(142 100% 75% / 0.4)',
                }}
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === 'login' && 'Entrar no painel'}
                {mode === 'signup' && 'Criar conta'}
                {mode === 'forgot' && 'Enviar e-mail de recuperação'}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-white/55">
              {mode === 'forgot' ? (
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-[hsl(195_100%_60%)] hover:text-[hsl(195_100%_75%)] hover:[text-shadow:0_0_8px_hsl(195_100%_50%/0.6)] font-medium inline-flex items-center gap-1 transition-all"
                >
                  <ArrowLeft className="h-3 w-3" /> Voltar ao login
                </button>
              ) : (
                <>
                  {mode === 'login' ? 'Não tem conta?' : 'Já tem conta?'}{' '}
                  <button
                    type="button"
                    onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                    className="text-[hsl(142_100%_55%)] hover:text-[hsl(142_100%_70%)] hover:[text-shadow:0_0_8px_hsl(142_100%_45%/0.6)] font-medium transition-all"
                  >
                    {mode === 'login' ? 'Criar conta' : 'Fazer login'}
                  </button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
