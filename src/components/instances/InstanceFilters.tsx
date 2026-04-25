import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X, ArrowUpDown } from 'lucide-react';
import { providerLabels } from './constants';

export type SortOption = 'newest' | 'oldest' | 'name_asc' | 'name_desc';

interface InstanceFiltersProps {
  searchText: string;
  onSearchChange: (v: string) => void;
  filterProvider: string;
  onProviderChange: (v: string) => void;
  filterStatus: string;
  onStatusChange: (v: string) => void;
  sortBy: SortOption;
  onSortChange: (v: SortOption) => void;
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
  sortBy, onSortChange,
  availableProviders = ['evolution', 'evolution_go', 'wuzapi', 'wppconnect', 'quepasa'],
  hasFilters, onClear,
  filterCompany, onCompanyChange, companies,
}: InstanceFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou número..."
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-9"
        />
      </div>
      {companies && onCompanyChange && (
        <Select value={filterCompany || 'all'} onValueChange={onCompanyChange}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Cliente" />
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
        <SelectTrigger className="w-[140px] h-9">
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
        <SelectTrigger className="w-[140px] h-9">
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
      <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortOption)}>
        <SelectTrigger className="w-[150px] h-9">
          <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
          <SelectValue placeholder="Ordenar" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Mais recentes</SelectItem>
          <SelectItem value="oldest">Mais antigas</SelectItem>
          <SelectItem value="name_asc">Nome A→Z</SelectItem>
          <SelectItem value="name_desc">Nome Z→A</SelectItem>
        </SelectContent>
      </Select>
      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-9 px-2" onClick={onClear}>
          <X className="h-4 w-4 mr-1" /> Limpar
        </Button>
      )}
    </div>
  );
}
