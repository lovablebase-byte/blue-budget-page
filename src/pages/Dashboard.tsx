import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Smartphone, MessageSquare, Users, Building2,
  Activity, AlertTriangle, Clock, Key, Link2,
  Copy, Eye, EyeOff, RefreshCw, Loader2, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';

export default function Dashboard() {
  const { role, company, isSuperAdmin, isAdmin, isReadOnly, user } = useAuth();
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [savingTz, setSavingTz] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [stats, setStats] = useState({ instances: 0, companies: 0, users: 0, messages: 0 });
  const [planName, setPlanName] = useState('—');
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  const accessToken = user?.id?.slice(0, 8) + '••••••••••••' + user?.id?.slice(-4);
  const fullToken = user?.id || '';

  useEffect(() => {
    if (!user) return;

    supabase.from('profiles').select('timezone, referral_code').eq('user_id', user.id).single()
      .then(({ data }) => {
        if (data) {
          setTimezone(data.timezone || 'America/Sao_Paulo');
          setReferralCode(data.referral_code || '');
        }
      });

    // Fetch stats
    if (company) {
      supabase.from('instances').select('id', { count: 'exact', head: true }).eq('company_id', company.id)
        .then(({ count }) => setStats(s => ({ ...s, instances: count || 0 })));
      
      supabase.from('subscriptions').select('*, plans(name)').eq('company_id', company.id).single()
        .then(({ data }) => {
          if (data) {
            setPlanName((data as any).plans?.name || '—');
            if (data.expires_at) {
              const days = Math.ceil((new Date(data.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              setDaysLeft(days);
            }
          }
        });
    }

    if (isSuperAdmin) {
      supabase.from('companies').select('id', { count: 'exact', head: true })
        .then(({ count }) => setStats(s => ({ ...s, companies: count || 0 })));
      supabase.from('user_roles').select('id', { count: 'exact', head: true })
        .then(({ count }) => setStats(s => ({ ...s, users: count || 0 })));
    }
  }, [user, company, isSuperAdmin]);

  const handleSaveTimezone = async () => {
    setSavingTz(true);
    try {
      await supabase.from('profiles').update({ timezone }).eq('user_id', user!.id);
      toast.success('Fuso horário atualizado!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingTz(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const referralLink = `${window.location.origin}/auth?ref=${referralCode}`;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Bem-vindo{isSuperAdmin ? ', Admin' : company ? `, ${company.name}` : ''}
          </h1>
          <p className="text-muted-foreground">
            {isSuperAdmin ? 'Visão global do sistema' : 'Painel de controle da sua empresa'}
          </p>
        </div>
        <Badge variant={isSuperAdmin ? 'default' : 'secondary'} className="capitalize">
          {role?.replace('_', ' ') || 'usuário'}
        </Badge>
      </div>

      {/* Alerts */}
      {isReadOnly && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <div>
            <p className="font-medium">Assinatura com pendências</p>
            <p className="text-sm text-muted-foreground">
              Operação em modo somente leitura. Regularize sua assinatura para voltar a operar.
            </p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto">Ver detalhes</Button>
        </div>
      )}

      {/* Main metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sincronização</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.instances}</div>
            <p className="text-xs text-muted-foreground">instâncias conectadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Acesso</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-muted px-2 py-1 rounded font-mono flex-1 truncate">
                {showToken ? fullToken : accessToken}
              </code>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setShowToken(!showToken)}>
                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(fullToken, 'Token')}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sistema</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">Online</div>
            <p className="text-xs text-muted-foreground">API operacional</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ciclo de vida</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {daysLeft !== null ? `${daysLeft}d` : '∞'}
            </div>
            <p className="text-xs text-muted-foreground">restantes · Plano {planName}</p>
          </CardContent>
        </Card>
      </div>

      {/* Second row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Timezone */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4" /> Fuso horário da conta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['America/Sao_Paulo','America/Manaus','America/Fortaleza','America/Cuiaba',
                    'America/New_York','Europe/London','Europe/Lisbon','Asia/Tokyo'].map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleSaveTimezone} disabled={savingTz}>
                {savingTz ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Referral */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="h-4 w-4" /> Link de indicação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-muted px-2 py-1 rounded font-mono flex-1 truncate">{referralLink}</code>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(referralLink, 'Link')}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Super admin extra */}
      {isSuperAdmin && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Empresas</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.companies}</div>
              <p className="text-xs text-muted-foreground">registradas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Usuários</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.users}</div>
              <p className="text-xs text-muted-foreground">no sistema</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Mensagens hoje</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.messages}</div>
              <p className="text-xs text-muted-foreground">enviadas</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
