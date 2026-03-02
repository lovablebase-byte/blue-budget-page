import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Loader2, User, Clock, Shield, LogOut } from 'lucide-react';

const timezones = [
  'America/Sao_Paulo', 'America/Manaus', 'America/Belem', 'America/Fortaleza',
  'America/Recife', 'America/Bahia', 'America/Cuiaba', 'America/Campo_Grande',
  'America/Porto_Velho', 'America/Rio_Branco', 'America/Noronha',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Lisbon', 'Europe/Madrid', 'Asia/Tokyo',
];

export default function Account() {
  const { user, signOut } = useAuth();
  const [fullName, setFullName] = useState('');
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingTz, setSavingTz] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    if (user) {
      supabase
        .from('profiles')
        .select('full_name, timezone')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setFullName(data.full_name || '');
            setTimezone(data.timezone || 'America/Sao_Paulo');
          }
        });
    }
  }, [user]);

  const handleSaveName = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('user_id', user!.id);
      if (error) throw error;
      toast.success('Nome atualizado!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTimezone = async () => {
    setSavingTz(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ timezone })
        .eq('user_id', user!.id);
      if (error) throw error;
      toast.success('Fuso horário atualizado!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingTz(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    setChangingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Senha alterada com sucesso!');
      setNewPassword('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setChangingPw(false);
    }
  };

  const handleSignOutAll = async () => {
    await supabase.auth.signOut({ scope: 'global' });
    toast.success('Todas as sessões foram encerradas');
    window.location.href = '/auth';
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Minha Conta</h1>
        <p className="text-muted-foreground">Gerencie suas informações pessoais e preferências</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Perfil</CardTitle>
          <CardDescription>Suas informações básicas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input value={user?.email || ''} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Nome completo</Label>
            <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <Button onClick={handleSaveName} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar nome
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Fuso Horário</CardTitle>
          <CardDescription>Define o horário exibido em todo o sistema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timezones.map((tz) => (
                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleSaveTimezone} disabled={savingTz}>
            {savingTz && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Atualizar fuso
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Segurança</CardTitle>
          <CardDescription>Alterar senha e gerenciar sessões</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-pw">Nova senha</Label>
            <Input id="new-pw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <Button onClick={handleChangePassword} disabled={changingPw || !newPassword}>
            {changingPw && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Alterar senha
          </Button>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Sessões ativas</p>
              <p className="text-xs text-muted-foreground">Encerrar todas as sessões em todos os dispositivos</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleSignOutAll} className="gap-1">
              <LogOut className="h-3.5 w-3.5" />
              Sair de todos
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
