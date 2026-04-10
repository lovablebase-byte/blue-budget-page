import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable, Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, Pencil } from 'lucide-react';

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
}

const emptyForm = { name: '', slug: '', is_active: true };

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default function AdminCompanies() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [autoSlug, setAutoSlug] = useState(true);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as CompanyRow[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('companies').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-companies'] }); toast.success('Status atualizado'); },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      if (!values.name.trim()) throw new Error('Nome obrigatório');
      if (!values.slug.trim()) throw new Error('Slug obrigatório');
      if (values.id) {
        const { error } = await supabase.from('companies').update({ name: values.name, slug: values.slug, is_active: values.is_active }).eq('id', values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('companies').insert({ name: values.name, slug: values.slug, is_active: values.is_active });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-companies'] });
      toast.success(editing ? 'Empresa atualizada' : 'Empresa criada');
      closeDialog();
    },
    onError: (e: any) => {
      if (e.message?.includes('unique') || e.message?.includes('duplicate')) {
        toast.error('Slug já existe. Escolha outro.');
      } else {
        toast.error(e.message);
      }
    },
  });

  const closeDialog = () => { setOpen(false); setEditing(null); setForm(emptyForm); setAutoSlug(true); };

  const openCreate = () => { setForm(emptyForm); setEditing(null); setAutoSlug(true); setOpen(true); };

  const openEdit = (row: CompanyRow) => {
    setEditing(row);
    setForm({ name: row.name, slug: row.slug, is_active: row.is_active });
    setAutoSlug(false);
    setOpen(true);
  };

  const handleNameChange = (name: string) => {
    setForm(prev => ({ ...prev, name, ...(autoSlug && !editing ? { slug: slugify(name) } : {}) }));
  };

  const columns: Column<CompanyRow>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'slug', label: 'Slug' },
    { key: 'is_active', label: 'Ativa', render: (row) => <Switch checked={row.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: row.id, is_active: v })} /> },
    { key: 'created_at', label: 'Criada em', render: (row) => new Date(row.created_at).toLocaleDateString('pt-BR') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Empresas</h1>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Nova Empresa</Button>
      </div>

      <DataTable
        data={companies}
        columns={columns}
        searchKey="name"
        searchPlaceholder="Buscar empresa..."
        loading={isLoading}
        emptyMessage="Nenhuma empresa"
        actions={(row) => (
          <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      />

      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Empresa' : 'Nova Empresa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Minha Empresa" />
            </div>
            <div>
              <Label>Slug (único)</Label>
              <Input
                value={form.slug}
                onChange={(e) => { setAutoSlug(false); setForm(prev => ({ ...prev, slug: e.target.value })); }}
                placeholder="minha-empresa"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm(prev => ({ ...prev, is_active: v }))} />
              <Label>Empresa ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button
              onClick={() => saveMutation.mutate(editing ? { ...form, id: editing.id } : form)}
              disabled={!form.name.trim() || !form.slug.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
