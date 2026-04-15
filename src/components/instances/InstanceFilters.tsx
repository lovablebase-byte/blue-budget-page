import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Search, X } from 'lucide-react';
import { providerLabels } from './constants';

interface InstanceFiltersProps {
  searchText: string;
  onSearchChange: (v: string) => void;
  filterProvider: string;
  onProviderChange: (v: string) => void;
  filterStatus: string;
  onStatusChange: (v: string) => void;
  availableProviders?: string[];
  hasFilters: boolean;
  onClear: () => void;
  /** Optional: for admin view with company filter */
  filterCompany?: string;
  onCompanyChange?: (v: string) => void;
  companies?: { id: string; name: string }[];
}

export function InstanceFilters({
  searchText, onSearchChange,
  filterProvider, onProviderChange,
  filterStatus, onStatusChange,
  availableProviders = ['evolution', 'wuzapi'],
  hasFilters, onClear,
  filterCompany, onCompanyChange, companies,
}: InstanceFiltersProps) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, número..."
                value={searchText}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          {companies && onCompanyChange && (
            <Select value={filterCompany || 'all'} onValueChange={onCompanyChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={filterProvider} onValueChange={onProviderChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos providers</SelectItem>
              {availableProviders.map(p => (
                <SelectItem key={p} value={p}>{providerLabels[p] || p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={onStatusChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="online">Conectado</SelectItem>
              <SelectItem value="offline">Desconectado</SelectItem>
              <SelectItem value="connecting">Conectando</SelectItem>
              <SelectItem value="error">Erro</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              <X className="h-4 w-4 mr-1" /> Limpar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
