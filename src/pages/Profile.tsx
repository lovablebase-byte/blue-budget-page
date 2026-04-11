import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from '@/hooks/use-toast';
import { Save, User } from 'lucide-react';

export default function Profile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState('');

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from('profiles').select('*').eq('user_id', user.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast({ title: 'Perfil atualizado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const initials = fullName ? fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Perfil</h1>
        <p className="text-muted-foreground">Suas informações pessoais</p>
      </div>

      <Card className="border-border/40 bg-card/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            Informações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/20 border border-border/30">
            <Avatar className="h-16 w-16 ring-2 ring-primary/30 ring-offset-2 ring-offset-background">
              <AvatarFallback className="text-lg bg-primary/20 text-primary font-bold">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-foreground">{fullName || 'Sem nome'}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Nome completo</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">E-mail</Label>
            <Input value={user?.email || ''} disabled className="bg-muted/30 border-border/30" />
          </div>

          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="h-4 w-4 mr-2" /> Salvar perfil
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
