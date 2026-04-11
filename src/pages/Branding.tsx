import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FeatureLockedBanner } from '@/components/PlanEnforcementGuard';
import { toast } from '@/hooks/use-toast';
import { Save, Upload, Image, Palette, Globe, X, AlertCircle, Lock } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function getPublicUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/branding/${path}`;
}

function hslToHex(hslStr: string): string {
  const parts = hslStr.split(/\s+/);
  if (parts.length < 3) return '#3b82f6';
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '221 83% 53%';
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export default function Branding() {
  const { company, isAdmin } = useAuth();
  const { isSuspended, hasFeature } = useCompany();
  const queryClient = useQueryClient();
  const whitelabelEnabled = hasFeature('whitelabel_enabled');

  const [form, setForm] = useState({
    logo_light_url: '',
    logo_dark_url: '',
    favicon_url: '',
    site_title: 'Painel',
    custom_domain: '',
    primary_color: '#3b82f6',
  });
  const [uploading, setUploading] = useState<string | null>(null);

  const { data: branding, isLoading } = useQuery({
    queryKey: ['branding', company?.id],
    queryFn: async () => {
      if (!company?.id) return null;
      const { data } = await supabase
        .from('company_branding')
        .select('*')
        .eq('company_id', company.id)
        .maybeSingle();
      return data;
    },
    enabled: !!company?.id,
  });

  useEffect(() => {
    if (branding) {
      setForm({
        logo_light_url: branding.logo_light_url || '',
        logo_dark_url: branding.logo_dark_url || '',
        favicon_url: branding.favicon_url || '',
        site_title: branding.site_title || 'Painel',
        custom_domain: branding.custom_domain || '',
        primary_color: hslToHex(branding.primary_color || '221 83% 53%'),
      });
    }
  }, [branding]);

  const isReadOnly = !isAdmin || isSuspended || !whitelabelEnabled;

  const handleUpload = async (file: File, field: 'logo_light_url' | 'logo_dark_url' | 'favicon_url') => {
    if (!company?.id || isReadOnly) return;
    setUploading(field);
    try {
      const ext = file.name.split('.').pop();
      const path = `${company.id}/${field}_${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('branding').upload(path, file, { upsert: true });
      if (error) throw error;
      const url = getPublicUrl(path);
      setForm(f => ({ ...f, [field]: url }));
      toast({ title: 'Upload concluído' });
    } catch (e: any) {
      toast({ title: 'Erro no upload', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!company?.id) throw new Error('Empresa não encontrada');
      const payload = {
        company_id: company.id,
        logo_light_url: form.logo_light_url || null,
        logo_dark_url: form.logo_dark_url || null,
        favicon_url: form.favicon_url || null,
        site_title: form.site_title || 'Painel',
        custom_domain: form.custom_domain || null,
        primary_color: hexToHsl(form.primary_color),
      };

      if (branding) {
        const { error } = await supabase.from('company_branding').update(payload).eq('id', branding.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('company_branding').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branding'] });
      toast({ title: 'Marca salva com sucesso! Recarregue para aplicar.' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const FileUploadField = ({ label, field, preview }: { label: string; field: 'logo_light_url' | 'logo_dark_url' | 'favicon_url'; preview: string }) => (
    <div className="space-y-2">
      <Label className="text-muted-foreground text-xs uppercase tracking-wider">{label}</Label>
      <div className="flex items-center gap-4">
        {preview ? (
          <div className="relative w-24 h-24 border border-border/40 rounded-lg overflow-hidden bg-muted/20 flex items-center justify-center group">
            <img src={preview} alt={label} className="max-w-full max-h-full object-contain" />
            {!isReadOnly && (
              <button
                onClick={() => setForm(f => ({ ...f, [field]: '' }))}
                className="absolute top-1 right-1 bg-destructive/90 text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : (
          <div className="w-24 h-24 border-2 border-dashed border-border/40 rounded-lg flex flex-col items-center justify-center text-muted-foreground gap-1 hover:border-primary/40 transition-colors">
            <Image className="h-6 w-6" />
            <span className="text-[10px]">Sem imagem</span>
          </div>
        )}
        {!isReadOnly && (
          <Button variant="outline" size="sm" disabled={uploading === field} asChild className="border-primary/40 text-primary hover:bg-primary/10">
            <label className="cursor-pointer">
              <Upload className="h-4 w-4 mr-1" />
              {uploading === field ? 'Enviando...' : 'Upload'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, field); e.target.value = ''; }}
              />
            </label>
          </Button>
        )}
      </div>
    </div>
  );

  if (isLoading) return <div className="p-8 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Personalização da Marca</h1>
        <p className="text-muted-foreground">Configure a identidade visual da sua empresa</p>
      </div>

      {isSuspended && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Assinatura suspensa</AlertTitle>
          <AlertDescription>Edição de branding desabilitada. Regularize sua assinatura.</AlertDescription>
        </Alert>
      )}

      {!whitelabelEnabled && !isSuspended && (
        <FeatureLockedBanner featureLabel="Personalização de marca (White-label)" />
      )}

      {isReadOnly && !isSuspended && whitelabelEnabled && !isAdmin && (
        <Alert className="bg-warning/5 border-warning/20">
          <Lock className="h-4 w-4 text-warning" />
          <AlertTitle>Somente leitura</AlertTitle>
          <AlertDescription>Apenas administradores podem editar a marca.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/40 bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10">
                <Image className="h-5 w-5 text-primary" />
              </div>
              Logotipos
            </CardTitle>
            <CardDescription>Logos para os modos claro e escuro</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FileUploadField label="Logo (Modo Claro)" field="logo_light_url" preview={form.logo_light_url} />
            <FileUploadField label="Logo (Modo Escuro)" field="logo_dark_url" preview={form.logo_dark_url} />
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-accent/10">
                <Globe className="h-5 w-5 text-accent" />
              </div>
              Site
            </CardTitle>
            <CardDescription>Favicon, título e domínio</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FileUploadField label="Favicon" field="favicon_url" preview={form.favicon_url} />
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Título do site</Label>
              <Input
                value={form.site_title}
                onChange={e => setForm(f => ({ ...f, site_title: e.target.value }))}
                placeholder="Nome exibido na aba do navegador"
                disabled={isReadOnly}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Domínio personalizado</Label>
              <Input
                value={form.custom_domain}
                onChange={e => setForm(f => ({ ...f, custom_domain: e.target.value }))}
                placeholder="painel.suaempresa.com"
                disabled={isReadOnly}
              />
              <p className="text-xs text-muted-foreground mt-1">Configure o DNS do seu domínio para apontar para este painel</p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-border/40 bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10">
                <Palette className="h-5 w-5 text-primary" />
              </div>
              Cor Primária
            </CardTitle>
            <CardDescription>Define a cor principal do painel</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 p-4 rounded-lg bg-muted/20 border border-border/30">
              <input
                type="color"
                value={form.primary_color}
                onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))}
                className="w-14 h-14 rounded-lg border-2 border-border/40 cursor-pointer hover:border-primary/40 transition-colors"
                disabled={isReadOnly}
              />
              <div className="space-y-1">
                <p className="text-sm font-semibold font-mono text-foreground">{form.primary_color.toUpperCase()}</p>
                <p className="text-xs text-muted-foreground font-mono">HSL: {hexToHsl(form.primary_color)}</p>
              </div>
              <div className="flex gap-2 ml-4">
                <div className="w-12 h-12 rounded-lg shadow-lg" style={{ backgroundColor: form.primary_color }} />
                <div className="w-12 h-12 rounded-lg" style={{ backgroundColor: form.primary_color, opacity: 0.7 }} />
                <div className="w-12 h-12 rounded-lg" style={{ backgroundColor: form.primary_color, opacity: 0.4 }} />
                <div className="w-12 h-12 rounded-lg" style={{ backgroundColor: form.primary_color, opacity: 0.15 }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {!isReadOnly && (
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-fit">
          <Save className="h-4 w-4 mr-2" /> Salvar Marca
        </Button>
      )}
    </div>
  );
}
