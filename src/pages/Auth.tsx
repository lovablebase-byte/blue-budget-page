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
    <div className="flex min-h-screen items-center justify-center bg-background px-4 relative overflow-hidden">
      {/* Ambient glow effects */}
      <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-primary/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-accent/6 rounded-full blur-[100px] pointer-events-none" />

      <Card className="w-full max-w-md border-border/60 shadow-[0_0_60px_-15px_hsl(var(--primary)/0.15),0_25px_50px_-12px_hsl(var(--foreground)/0.08)] hover:border-primary/30 transition-all duration-300">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-dark glow-primary">
            <MessageSquare className="h-8 w-8 text-primary-foreground drop-shadow-[0_0_6px_hsl(var(--glow)/0.5)]" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground tracking-tight">WhatsApp Manager</CardTitle>
          <CardDescription className="text-muted-foreground mt-1">
            {mode === 'login' && 'Entre na sua conta'}
            {mode === 'signup' && 'Crie uma nova conta'}
            {mode === 'forgot' && 'Recupere sua senha'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="name" className="text-foreground/90">Nome completo</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" required />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground/90">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required />
            </div>
            {mode !== 'forgot' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-foreground/90">Senha</Label>
                  {mode === 'login' && (
                    <button type="button" onClick={() => setMode('forgot')} className="text-xs text-primary hover:text-[hsl(var(--glow))] hover:underline transition-colors">
                      Esqueceu a senha?
                    </button>
                  )}
                </div>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
            )}
            <Button type="submit" className="w-full h-11 text-sm font-semibold shadow-[0_0_20px_-4px_hsl(var(--primary)/0.4)] hover:shadow-[0_0_28px_-4px_hsl(var(--glow)/0.5)] transition-all duration-300" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'login' && 'Entrar no painel'}
              {mode === 'signup' && 'Criar conta'}
              {mode === 'forgot' && 'Enviar e-mail de recuperação'}
            </Button>
          </form>

          <div className="mt-5 text-center text-sm text-muted-foreground">
            {mode === 'forgot' ? (
              <button type="button" onClick={() => setMode('login')} className="text-primary hover:text-[hsl(var(--glow))] hover:underline font-medium inline-flex items-center gap-1 transition-colors">
                <ArrowLeft className="h-3 w-3" /> Voltar ao login
              </button>
            ) : (
              <>
                {mode === 'login' ? 'Não tem conta?' : 'Já tem conta?'}{' '}
                <button type="button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="text-primary hover:text-[hsl(var(--glow))] hover:underline font-medium transition-colors">
                  {mode === 'login' ? 'Criar conta' : 'Fazer login'}
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
