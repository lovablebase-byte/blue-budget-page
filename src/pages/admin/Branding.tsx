import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Save, Upload, Image, Palette, Globe, X, Building2 } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function getPublicUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/branding/${path}`;
}

export default function AdminBranding() {
  const queryClient = useQueryClient();

  // Company selector
  const { data: companies = [] } = useQuery({
    queryKey: ['admin-companies-list'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id, name').order('name');
      return data || [];
    },
  });

  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  const { data: branding, isLoading } = useQuery({
    queryKey: ['admin-branding', selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return null;
      const { data } = await supabase
        .from('company_branding')
        .select('*')
        .eq('company_id', selectedCompanyId)
        .maybeSingle();
      return data;
    },
    enabled: !!selectedCompanyId,
  });

  const [form, setForm] = useState({
    logo_light_url: '',
    logo_dark_url: '',
    favicon_url: '',
    site_title: 'Painel',
    custom_domain: '',
    primary_color: '#3b82f6',
  });
  const [uploading, setUploading] = useState<string | null>(null);

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
    } else if (selectedCompanyId) {
      setForm({ logo_light_url: '', logo_dark_url: '', favicon_url: '', site_title: 'Painel', custom_domain: '', primary_color: '#3b82f6' });
    }
  }, [branding, selectedCompanyId]);

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

  const handleUpload = async (file: File, field: 'logo_light_url' | 'logo_dark_url' | 'favicon_url') => {
    if (!selectedCompanyId) return;
    setUploading(field);
    try {
      const ext = file.name.split('.').pop();
      const path = `${selectedCompanyId}/${field}_${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('branding').upload(path, file, { upsert: true });
      if (error) throw error;
      setForm(f => ({ ...f, [field]: getPublicUrl(path) }));
      toast.success('Upload concluído');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(null);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error('Selecione uma empresa');
      const payload = {
        company_id: selectedCompanyId,
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
      queryClient.invalidateQueries({ queryKey: ['admin-branding'] });
      toast.success('Marca salva com sucesso');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const FileUploadField = ({ label, field, preview }: { label: string; field: 'logo_light_url' | 'logo_dark_url' | 'favicon_url'; preview: string }) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-4">
        {preview ? (
          <div className="relative w-20 h-20 border rounded-md overflow-hidden bg-accent/30 flex items-center justify-center">
            <img src={preview} alt={label} className="max-w-full max-h-full object-contain" />
            <button onClick={() => setForm(f => ({ ...f, [field]: '' }))} className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5">
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="w-20 h-20 border rounded-md border-dashed flex items-center justify-center text-muted-foreground">
            <Image className="h-6 w-6" />
          </div>
        )}
        <Button variant="outline" size="sm" disabled={uploading === field} asChild>
          <label className="cursor-pointer">
            <Upload className="h-4 w-4 mr-1" />
            {uploading === field ? 'Enviando...' : 'Upload'}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, field); e.target.value = ''; }} />
          </label>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Marca / White-Label</h1>
        <p className="text-muted-foreground">Gerencie a identidade visual de cada empresa</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Selecionar Empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
            <SelectTrigger className="w-full max-w-sm"><SelectValue placeholder="Selecione uma empresa..." /></SelectTrigger>
            <SelectContent>
              {companies.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedCompanyId && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Image className="h-5 w-5" /> Logotipos</CardTitle>
                <CardDescription>Logos para os modos claro e escuro</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FileUploadField label="Logo (Modo Claro)" field="logo_light_url" preview={form.logo_light_url} />
                <FileUploadField label="Logo (Modo Escuro)" field="logo_dark_url" preview={form.logo_dark_url} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Site</CardTitle>
                <CardDescription>Favicon, título e domínio</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FileUploadField label="Favicon" field="favicon_url" preview={form.favicon_url} />
                <div>
                  <Label>Título do site</Label>
                  <Input value={form.site_title} onChange={e => setForm(f => ({ ...f, site_title: e.target.value }))} placeholder="Nome na aba do navegador" />
                </div>
                <div>
                  <Label>Domínio personalizado</Label>
                  <Input value={form.custom_domain} onChange={e => setForm(f => ({ ...f, custom_domain: e.target.value }))} placeholder="painel.empresa.com" />
                  <p className="text-xs text-muted-foreground mt-1">DNS deve apontar para este painel</p>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" /> Cor Primária</CardTitle>
                <CardDescription>Define a cor principal do painel da empresa</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <input type="color" value={form.primary_color} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))} className="w-12 h-12 rounded-md border cursor-pointer" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{form.primary_color.toUpperCase()}</p>
                    <p className="text-xs text-muted-foreground">HSL: {hexToHsl(form.primary_color)}</p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <div className="w-10 h-10 rounded-md" style={{ backgroundColor: form.primary_color }} />
                    <div className="w-10 h-10 rounded-md" style={{ backgroundColor: form.primary_color, opacity: 0.7 }} />
                    <div className="w-10 h-10 rounded-md" style={{ backgroundColor: form.primary_color, opacity: 0.4 }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-fit">
            <Save className="h-4 w-4 mr-2" /> Salvar Marca
          </Button>
        </>
      )}
    </div>
  );
}
